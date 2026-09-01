import answersData from "../data/answers.json";
import validWordsData from "../data/validWords.json";
import type { EvaluatedLetter } from "../types/game";
import { evaluateGuess } from "../utils/evaluateGuess";
import { normalizeWord } from "../utils/normalizeWord";
import {
  CHAMPIONSHIP_MODE_ORDER,
  CHAMPIONSHIP_SCORING,
  CHAMPIONSHIP_TIMEZONE,
} from "./config";
import { formatNorteWeekRange, getBrazilWeekEnd, getWeekDayColumns } from "./weeklyChampionshipDomain";
import { ChampionshipError } from "./errors";
import { rankParticipants } from "./ranking";
import { calculateRoundScore } from "./scoring";
import type {
  CreateChampionshipInput,
  ChampionshipService,
  CreateNextChampionshipResult,
  StartNowResult,
} from "./service";
import { getZonedToday } from "./timezone";
import type {
  AdminOverview,
  AdminPlayer,
  AdminPlayerHistory,
  AdminRoundAnswers,
  ChampionshipSchedule,
  ChampionshipBoard,
  ChampionshipHistoryItem,
  ChampionshipMode,
  ChampionshipPlayerStats,
  ChampionshipResults,
  ChampionshipRoundState,
  ChampionshipState,
  ChampionshipStatus,
  Leaderboard,
  ParticipantRoundStatus,
  ParticipationStatus,
  WeeklyDayProgress,
} from "./types";

/**
 * Motor do campeonato em memoria.
 *
 * Reproduz as mesmas regras das funcoes SQL (validacao, avaliacao, pontuacao,
 * ordem das rodadas, ocultacao de respostas, classificacao e desempates).
 * Usos:
 *   1. testes de integracao e de concorrencia sem depender de um Postgres;
 *   2. modo demonstracao local quando o Supabase nao esta configurado.
 *
 * Nao substitui o backend em producao: e o espelho executavel das regras.
 */

const ROUND_BLUEPRINT: Array<{
  mode: ChampionshipMode;
  roundOrder: number;
  boardCount: number;
  maxAttempts: number;
}> = [
  { mode: "SIMPLE", roundOrder: 1, boardCount: 1, maxAttempts: 6 },
  { mode: "DUET", roundOrder: 2, boardCount: 2, maxAttempts: 7 },
  { mode: "QUARTET", roundOrder: 3, boardCount: 4, maxAttempts: 9 },
  { mode: "SEXTET", roundOrder: 4, boardCount: 6, maxAttempts: 12 },
];

type EngineChampionship = {
  id: string;
  name: string;
  championshipDate: string;
  timezone: string;
  registrationOpensAt: number;
  registrationClosesAt: number;
  startsAt: number;
  finishedAt: number | null;
  status: ChampionshipStatus;
  isOfficial: boolean;
  createdAt: number;
  /** Instante em que as rodadas foram efetivamente liberadas. */
  actualStartedAt: number | null;
};

type EngineRound = {
  id: string;
  championshipId: string;
  mode: ChampionshipMode;
  roundOrder: number;
  boardCount: number;
  maxAttempts: number;
  timeLimitSeconds: number | null;
};

type EngineAnswer = {
  championshipId: string;
  roundId: string;
  boardIndex: number;
  answer: string;
  normalizedAnswer: string;
};

type EngineParticipant = {
  id: string;
  championshipId: string;
  userId: string;
  displayName: string;
  status: ParticipationStatus;
  registeredAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  totalScore: number;
  wordsSolved: number;
  completedRounds: number;
  totalAttempts: number;
  totalDurationMs: number;
  finalPosition: number | null;
};

type EngineAttempt = {
  attemptNumber: number;
  normalizedWord: string;
  boards: Array<{ boardIndex: number; solved: boolean; letters: EvaluatedLetter[] }>;
};

type EngineParticipantRound = {
  id: string;
  participantId: string;
  roundId: string;
  status: ParticipantRoundStatus;
  startedAt: number | null;
  finishedAt: number | null;
  attemptsUsed: number;
  wordsSolved: number;
  allWordsSolved: boolean;
  baseScore: number;
  bonusScore: number;
  totalScore: number;
  durationMs: number;
  attempts: EngineAttempt[];
};

/**
 * Fonte das contas para a aba de jogadores do painel.
 * Injetavel para os testes ligarem o motor de contas ao do campeonato,
 * sem o campeonato passar a conhecer o schema de contas.
 */
export type AdminPlayerSource = {
  listPlayers(): AdminPlayer[];
  getPlayerGames(userId: string, limit: number, offset: number): AdminPlayerHistory;
};

export type LocalEngineOptions = {
  answerPool?: string[];
  validWords?: string[];
  now?: number | (() => number);
  random?: () => number;
  allowLateRegistration?: boolean;
  maxDurationMinutes?: number;
  playerSource?: AdminPlayerSource;
};

export class LocalChampionshipEngine {
  private readonly championships = new Map<string, EngineChampionship>();
  private readonly rounds: EngineRound[] = [];
  private readonly answers: EngineAnswer[] = [];
  private readonly participants: EngineParticipant[] = [];
  private readonly participantRounds: EngineParticipantRound[] = [];
  private readonly profiles = new Map<string, { id: string; displayName: string; createdAt: number }>();
  private readonly admins = new Set<string>();
  private playerSource: AdminPlayerSource | null;
  private readonly answerPool: string[];
  private readonly validWords: Set<string>;
  private nowFn: () => number;
  private readonly random: () => number;
  private readonly allowLateRegistration: boolean;
  private readonly maxDurationMs: number;
  private idCounter = 0;

  constructor(options: LocalEngineOptions | number = {}) {
    const opts: LocalEngineOptions = typeof options === "number" ? { now: options } : options;
    this.answerPool = opts.answerPool ?? (answersData as string[]);
    this.validWords = new Set(
      (opts.validWords ?? (validWordsData as string[])).map(normalizeWord),
    );
    for (const word of this.answerPool) {
      this.validWords.add(normalizeWord(word));
    }
    const nowOpt = opts.now ?? (() => Date.now());
    this.nowFn = typeof nowOpt === "function" ? nowOpt : () => nowOpt;
    this.random = opts.random ?? Math.random;
    this.allowLateRegistration = opts.allowLateRegistration ?? false;
    this.playerSource = opts.playerSource ?? null;
    this.maxDurationMs = (opts.maxDurationMinutes ?? 180) * 60_000;
  }

  now(): number {
    return this.nowFn();
  }

  setTime(now: number | (() => number)): void {
    this.nowFn = typeof now === "function" ? now : () => now;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------
  // Administracao
  // -------------------------------------------------------------------

  createChampionship(input: CreateChampionshipInput = {}): EngineChampionship {
    const championshipDate =
      input.championshipDate ?? getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE);
    const dayStart = getSaoPauloDayStart(championshipDate);
    const dayEnd = getSaoPauloDayEnd(championshipDate);
    const startsAt = input.startsAt !== undefined
      ? Date.parse(input.startsAt)
      : dayStart;
    const registrationOpensAt = input.registrationOpensAt !== undefined
      ? Date.parse(input.registrationOpensAt)
      : startsAt - 1000;
    const registrationClosesAt = input.registrationClosesAt !== undefined
      ? Date.parse(input.registrationClosesAt)
      : dayEnd;

    if (
      [...this.championships.values()].some(
        (item) => item.championshipDate === championshipDate && item.status !== "CANCELLED",
      )
    ) {
      // Espelha o indice championships_one_official_per_date: encerrado
      // continua ocupando a data.
      throw new ChampionshipError("CHAMPIONSHIP_DATE_TAKEN");
    }

    const championship: EngineChampionship = {
      id: this.nextId("championship"),
      name: input.name ?? "Campeonato Norte",
      championshipDate,
      timezone: CHAMPIONSHIP_TIMEZONE,
      registrationOpensAt,
      registrationClosesAt,
      startsAt,
      finishedAt: null,
      status: this.now() >= startsAt && this.now() < registrationClosesAt ? "IN_PROGRESS" : "SCHEDULED",
      isOfficial: true,
      createdAt: this.now(),
      actualStartedAt: null,
    };

    this.championships.set(championship.id, championship);

    for (const blueprint of ROUND_BLUEPRINT) {
      this.rounds.push({
        id: this.nextId("round"),
        championshipId: championship.id,
        timeLimitSeconds: null,
        ...blueprint,
      });
    }

    this.drawWords(championship.id);
    return championship;
  }

  /**
   * Cria na proxima data sem campeonato oficial ativo.
   *
   * Espelha cd_admin_create_next_championship: campeonato encerrado
   * continua ocupando a data, entao a busca pula os dias ja usados.
   */
  createNextChampionship(): CreateNextChampionshipResult {
    const today = getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE);
    const taken = new Set(
      [...this.championships.values()]
        .filter((item) => item.isOfficial && item.status !== "CANCELLED")
        .map((item) => item.championshipDate),
    );

    for (let daysAhead = 0; daysAhead <= 60; daysAhead += 1) {
      const candidate = new Date(`${today}T12:00:00Z`);
      candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
      const candidateDate = candidate.toISOString().slice(0, 10);

      if (taken.has(candidateDate)) {
        continue;
      }

      const created = this.createChampionship({ championshipDate: candidateDate });

      return {
        championshipId: created.id,
        championshipDate: created.championshipDate,
        startsAt: new Date(created.startsAt).toISOString(),
        isToday: candidateDate === today,
        daysAhead,
      };
    }

    throw new ChampionshipError("NO_FREE_CHAMPIONSHIP_DATE");
  }

  drawWords(championshipId: string): number {
    const rounds = this.getRounds(championshipId);
    const required = rounds.reduce((total, round) => total + round.boardCount, 0);
    const pool = [...new Map(this.answerPool.map((word) => [normalizeWord(word), word])).values()];

    if (pool.length < required) {
      throw new ChampionshipError("WORD_POOL_TOO_SMALL");
    }

    // Remove o sorteio anterior.
    for (let index = this.answers.length - 1; index >= 0; index -= 1) {
      if (this.answers[index].championshipId === championshipId) {
        this.answers.splice(index, 1);
      }
    }

    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    let cursor = 0;
    for (const round of rounds) {
      for (let boardIndex = 0; boardIndex < round.boardCount; boardIndex += 1) {
        const word = shuffled[cursor];
        cursor += 1;
        this.answers.push({
          championshipId,
          roundId: round.id,
          boardIndex,
          answer: word,
          normalizedAnswer: normalizeWord(word),
        });
      }
    }

    return cursor;
  }

  /** Apenas para testes: remove o sorteio de um campeonato. */
  clearAnswers(championshipId: string): void {
    for (let index = this.answers.length - 1; index >= 0; index -= 1) {
      if (this.answers[index].championshipId === championshipId) {
        this.answers.splice(index, 1);
      }
    }
  }

  /** Apenas para testes: define respostas conhecidas. */
  setAnswers(championshipId: string, wordsByRound: Record<ChampionshipMode, string[]>): void {
    for (let index = this.answers.length - 1; index >= 0; index -= 1) {
      if (this.answers[index].championshipId === championshipId) {
        this.answers.splice(index, 1);
      }
    }

    for (const round of this.getRounds(championshipId)) {
      const words = wordsByRound[round.mode] ?? [];

      if (words.length !== round.boardCount) {
        throw new ChampionshipError("UNKNOWN", `Quantidade invalida para ${round.mode}.`);
      }

      words.forEach((word, boardIndex) => {
        this.answers.push({
          championshipId,
          roundId: round.id,
          boardIndex,
          answer: word,
          normalizedAnswer: normalizeWord(word),
        });
        this.validWords.add(normalizeWord(word));
      });
    }
  }

  setStatus(championshipId: string, status: ChampionshipStatus): void {
    const championship = this.requireChampionship(championshipId);

    if (status === "FINISHED") {
      this.finishChampionship(championshipId);
      return;
    }

    championship.status = status;
  }

  // -------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------

  private requireChampionship(championshipId: string): EngineChampionship {
    const championship = this.championships.get(championshipId);

    if (championship === undefined) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    return championship;
  }

  getRounds(championshipId: string): EngineRound[] {
    return this.rounds
      .filter((round) => round.championshipId === championshipId)
      .sort((left, right) => left.roundOrder - right.roundOrder);
  }

  private requireRound(roundId: string): EngineRound {
    const round = this.rounds.find((item) => item.id === roundId);

    if (round === undefined) {
      throw new ChampionshipError("ROUND_NOT_FOUND");
    }

    return round;
  }

  ensureCurrentNorteRound(referenceDate?: string): string | null {
    const targetDate =
      referenceDate ?? getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE);
    const dateObj = new Date(`${targetDate}T12:00:00Z`);
    const day = dateObj.getUTCDay(); // 0 is Sunday, 1..5 is Mon..Fri, 6 is Saturday

    if (day < 1 || day > 5) {
      return null;
    }

    const existing = [...this.championships.values()].find(
      (champ) => champ.isOfficial && champ.status !== "CANCELLED" && champ.championshipDate === targetDate,
    );

    if (existing) {
      return existing.id;
    }

    const created = this.createChampionship({
      name: "Campeonato Norte",
      championshipDate: targetDate,
    });

    return created.id;
  }

  getCurrentChampionshipId(): string | null {
    this.ensureCurrentNorteRound();

    const open = [...this.championships.values()]
      .filter((item) => item.status !== "CANCELLED")
      .sort((left, right) => {
        const leftOpen = left.status === "FINISHED" ? 1 : 0;
        const rightOpen = right.status === "FINISHED" ? 1 : 0;
        return leftOpen - rightOpen || right.startsAt - left.startsAt;
      });

    return open[0]?.id ?? null;
  }

  refreshStatus(championshipId: string): EngineChampionship {
    const championship = this.requireChampionship(championshipId);
    const currentTime = this.now();

    if (
      championship.status === "FINISHED" ||
      championship.status === "CANCELLED" ||
      championship.status === "CALCULATING_RESULTS"
    ) {
      return championship;
    }

    const dailyOpenAllDay = isDailyOpenAllDay(championship);
    const playableEnd = getPlayableEnd(championship, this.maxDurationMs);

    if (currentTime >= playableEnd) {
      this.finishChampionship(championshipId);
      return championship;
    }

    if (currentTime >= championship.startsAt) {
      championship.status = "IN_PROGRESS";
    } else if (!dailyOpenAllDay && currentTime >= championship.registrationClosesAt) {
      championship.status = "WAITING";
    } else if (!dailyOpenAllDay && currentTime >= championship.registrationOpensAt) {
      championship.status = "REGISTRATION_OPEN";
    } else {
      championship.status = "SCHEDULED";
    }

    if (championship.status === "IN_PROGRESS") {
      championship.actualStartedAt = championship.actualStartedAt ?? currentTime;
      this.tryAutoFinish(championshipId);
    }

    return championship;
  }

  // -------------------------------------------------------------------
  // Controles administrativos
  // -------------------------------------------------------------------

  addAdmin(userId: string): void {
    this.admins.add(userId);
  }

  setPlayerSource(source: AdminPlayerSource): void {
    this.playerSource = source;
  }

  /** Contas cadastradas. Nunca inclui e-mail. */
  adminListPlayers(userId: string | null): AdminPlayer[] {
    this.requireAdmin(userId);
    return this.playerSource?.listPlayers() ?? [];
  }

  adminPlayerGames(
    userId: string | null,
    targetUserId: string,
    limit: number,
    offset: number,
  ): AdminPlayerHistory {
    this.requireAdmin(userId);

    if (this.playerSource === null) {
      return { userId: targetUserId, username: null, displayName: "", entries: [] };
    }

    return this.playerSource.getPlayerGames(targetUserId, limit, offset);
  }

  isAdmin(userId: string | null): boolean {
    return userId !== null && this.admins.has(userId);
  }

  requireAdmin(userId: string | null): void {
    if (!this.isAdmin(userId)) {
      throw new ChampionshipError("FORBIDDEN");
    }
  }

  private requireEditableSchedule(championship: EngineChampionship): void {
    if (!["SCHEDULED", "REGISTRATION_OPEN", "WAITING"].includes(championship.status)) {
      throw new ChampionshipError("SCHEDULE_UPDATE_NOT_ALLOWED");
    }
  }

  /**
   * Antecipa o inicio para agora.
   *
   * Espelha cd_admin_start_championship_now: mexe nos HORARIOS, porque o
   * status e derivado deles. Preserva respostas, rodadas, participantes e
   * tentativas. Idempotente.
   */
  adminStartNow(
    userId: string | null,
    championshipId: string,
  ): {
    championshipId: string;
    status: ChampionshipStatus;
    startsAt: string;
    registrationClosesAt: string;
    alreadyStarted: boolean;
    participantCount: number;
    answerCount: number;
  } {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);

    // Reavalia pelo relogio antes de decidir: o campeonato pode ter
    // encerrado sozinho por tempo maximo desde a ultima leitura.
    const currentStatus = this.refreshStatus(championshipId).status;

    if (currentStatus === "CANCELLED") {
      throw new ChampionshipError("CHAMPIONSHIP_CANCELLED");
    }

    if (currentStatus === "FINISHED" || currentStatus === "CALCULATING_RESULTS") {
      throw new ChampionshipError("CHAMPIONSHIP_ALREADY_FINISHED");
    }

    const answerCount = this.answers.filter(
      (item) => item.championshipId === championshipId,
    ).length;
    const participantCount = this.participants.filter(
      (item) => item.championshipId === championshipId && item.status !== "CANCELLED",
    ).length;

    // Ja em andamento: resposta identica, sem efeito colateral.
    if (currentStatus === "IN_PROGRESS") {
      return {
        championshipId,
        status: "IN_PROGRESS",
        startsAt: new Date(championship.startsAt).toISOString(),
        registrationClosesAt: new Date(championship.registrationClosesAt).toISOString(),
        alreadyStarted: true,
        participantCount,
        answerCount,
      };
    }

    if (answerCount === 0) {
      throw new ChampionshipError("CHAMPIONSHIP_WITHOUT_ANSWERS");
    }

    const moment = this.now();

    championship.registrationOpensAt = Math.min(
      championship.registrationOpensAt,
      moment - 60_000,
    );
    championship.registrationClosesAt = Math.min(championship.registrationClosesAt, moment);
    championship.startsAt = moment;
    championship.status = "IN_PROGRESS";
    championship.actualStartedAt = championship.actualStartedAt ?? moment;

    return {
      championshipId,
      status: "IN_PROGRESS",
      startsAt: new Date(championship.startsAt).toISOString(),
      registrationClosesAt: new Date(championship.registrationClosesAt).toISOString(),
      alreadyStarted: false,
      participantCount,
      answerCount,
    };
  }

  adminUpdateSchedule(
    userId: string | null,
    championshipId: string,
    schedule: { registrationOpensAt: string; registrationClosesAt: string; startsAt: string },
  ): void {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);
    this.refreshStatus(championshipId);
    this.requireEditableSchedule(championship);

    const opens = Date.parse(schedule.registrationOpensAt);
    const closes = Date.parse(schedule.registrationClosesAt);
    const starts = Date.parse(schedule.startsAt);

    if (Number.isNaN(opens) || Number.isNaN(closes) || Number.isNaN(starts)) {
      throw new ChampionshipError("INVALID_SCHEDULE_ORDER");
    }

    if (opens >= closes || closes > starts) {
      throw new ChampionshipError("INVALID_SCHEDULE_ORDER");
    }

    championship.registrationOpensAt = opens;
    championship.registrationClosesAt = closes;
    championship.startsAt = starts;
    this.refreshStatus(championshipId);
  }

  adminOpenRegistrationNow(userId: string | null, championshipId: string): void {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);
    this.refreshStatus(championshipId);
    this.requireEditableSchedule(championship);

    const moment = this.now();
    const closes = Math.max(championship.registrationClosesAt, moment + 60_000);

    championship.registrationOpensAt = moment;
    championship.registrationClosesAt = closes;
    championship.startsAt = Math.max(championship.startsAt, closes);
    this.refreshStatus(championshipId);
  }

  adminCloseRegistrationNow(userId: string | null, championshipId: string): void {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);
    this.refreshStatus(championshipId);
    this.requireEditableSchedule(championship);

    const moment = this.now();

    championship.registrationOpensAt = Math.min(
      championship.registrationOpensAt,
      moment - 60_000,
    );
    championship.registrationClosesAt = moment;
    championship.startsAt = Math.max(championship.startsAt, moment);
    this.refreshStatus(championshipId);
  }

  adminScheduleStartIn(userId: string | null, championshipId: string, minutes: number): void {
    this.requireAdmin(userId);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new ChampionshipError("INVALID_SCHEDULE_ORDER");
    }

    const championship = this.requireChampionship(championshipId);
    this.refreshStatus(championshipId);
    this.requireEditableSchedule(championship);

    const moment = this.now();
    const target = moment + minutes * 60_000;

    championship.registrationOpensAt = Math.min(
      championship.registrationOpensAt,
      moment - 60_000,
    );
    championship.registrationClosesAt = target;
    championship.startsAt = target;
    this.refreshStatus(championshipId);
  }

  /** Cancela sem apagar nada: apenas muda o estado. Idempotente. */
  adminCancel(userId: string | null, championshipId: string): void {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);

    if (championship.status === "CANCELLED") {
      return;
    }

    if (championship.status === "FINISHED") {
      throw new ChampionshipError("CHAMPIONSHIP_ALREADY_FINISHED");
    }

    championship.status = "CANCELLED";
    championship.finishedAt = championship.finishedAt ?? this.now();
  }

  adminFinish(userId: string | null, championshipId: string): void {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);

    if (championship.status === "CANCELLED") {
      throw new ChampionshipError("CHAMPIONSHIP_CANCELLED");
    }

    this.finishChampionship(championshipId);
  }

  /** Respostas: so depois do encerramento, mesmo para administradores. */
  adminAnswers(
    userId: string | null,
    championshipId: string,
  ): Array<{ roundId: string; mode: ChampionshipMode; roundOrder: number; answers: string[] }> {
    this.requireAdmin(userId);
    const championship = this.requireChampionship(championshipId);

    if (this.refreshStatus(championshipId).status !== "FINISHED") {
      throw new ChampionshipError("ANSWERS_NOT_AVAILABLE");
    }

    return this.getRounds(championship.id).map((round) => ({
      roundId: round.id,
      mode: round.mode,
      roundOrder: round.roundOrder,
      answers: this.answers
        .filter((item) => item.roundId === round.id)
        .sort((left, right) => left.boardIndex - right.boardIndex)
        .map((item) => item.answer),
    }));
  }

  /**
   * Participacoes de um usuario, para o progresso pessoal derivar delas.
   * O campeonato continua sendo a fonte da verdade: nada e copiado.
   */
  getParticipations(userId: string) {
    return this.participants
      .filter((participant) => participant.userId === userId)
      .map((participant) => {
        const championship = this.championships.get(participant.championshipId);

        return {
          championshipId: participant.championshipId,
          championshipDate: championship?.championshipDate ?? "",
          championshipStatus: championship?.status ?? "CANCELLED",
          participationStatus: participant.status,
          startedAt: toIso(participant.startedAt),
          finalPosition: participant.finalPosition,
          totalScore: participant.totalScore,
          wordsSolved: participant.wordsSolved,
          totalAttempts: participant.totalAttempts,
          totalDurationMs: participant.totalDurationMs,
          completedRounds: participant.completedRounds,
          wordsTotal: this.getRounds(participant.championshipId).reduce(
            (total, round) => total + round.boardCount,
            0,
          ),
          participantCount: this.participants.filter(
            (item) =>
              item.championshipId === participant.championshipId &&
              item.status !== "CANCELLED",
          ).length,
        };
      });
  }

  /** Campeonatos oficiais realizados, para calendario e historico pessoal. */
  getOfficialChampionships() {
    return [...this.championships.values()]
      .filter((championship) => championship.isOfficial)
      .map((championship) => ({
        id: championship.id,
        date: championship.championshipDate,
        status: championship.status,
        participantCount: this.participants.filter(
          (item) => item.championshipId === championship.id && item.status !== "CANCELLED",
        ).length,
        wordsTotal: this.getRounds(championship.id).reduce(
          (total, round) => total + round.boardCount,
          0,
        ),
      }));
  }

  getTodayChampionshipId(today: string): string | null {
    const match = [...this.championships.values()]
      .filter(
        (item) =>
          item.isOfficial && item.status !== "CANCELLED" && item.championshipDate === today,
      )
      .sort((left, right) => right.startsAt - left.startsAt)[0];

    return match?.id ?? null;
  }

  private tryAutoFinish(championshipId: string): boolean {
    const championship = this.requireChampionship(championshipId);

    if (championship.status !== "IN_PROGRESS") {
      return false;
    }

    const dailyOpenAllDay = isDailyOpenAllDay(championship);

    if (this.now() >= getPlayableEnd(championship, this.maxDurationMs)) {
      this.finishChampionship(championshipId);
      return true;
    }

    if (!dailyOpenAllDay) {
      const registered = this.participants.filter(
        (item) => item.championshipId === championshipId && item.status !== "CANCELLED",
      );
      const open = registered.filter(
        (item) => item.status === "REGISTERED" || item.status === "IN_PROGRESS",
      );

      if (registered.length > 0 && open.length === 0) {
        this.finishChampionship(championshipId);
        return true;
      }
    }

    return false;
  }

  finishChampionship(championshipId: string): void {
    const championship = this.requireChampionship(championshipId);

    if (championship.status === "FINISHED" || championship.status === "CANCELLED") {
      return;
    }

    championship.status = "CALCULATING_RESULTS";
    const currentTime = this.now();

    for (const participant of this.participants) {
      if (participant.championshipId !== championshipId) {
        continue;
      }

      for (const participantRound of this.participantRounds) {
        if (
          participantRound.participantId === participant.id &&
          (participantRound.status === "NOT_STARTED" || participantRound.status === "IN_PROGRESS")
        ) {
          participantRound.status = "EXPIRED";
          participantRound.finishedAt = participantRound.finishedAt ?? currentTime;
        }
      }

      if (participant.status === "REGISTERED" || participant.status === "IN_PROGRESS") {
        participant.status = "ABANDONED";
        participant.finishedAt = participant.finishedAt ?? currentTime;
      }

      this.recalculateTotals(participant.id);
    }

    this.consolidateRanking(championshipId);
    championship.status = "FINISHED";
    championship.finishedAt = championship.finishedAt ?? currentTime;
  }

  consolidateRanking(championshipId: string): void {
    const participants = this.participants.filter(
      (item) => item.championshipId === championshipId && item.status !== "CANCELLED",
    );

    const ranked = rankParticipants(
      participants.map((participant) => ({
        participantId: participant.id,
        totalScore: participant.totalScore,
        wordsSolved: participant.wordsSolved,
        completedRounds: participant.completedRounds,
        totalAttempts: participant.totalAttempts,
        totalDurationMs: participant.totalDurationMs,
        finishedAt:
          participant.finishedAt === null ? null : new Date(participant.finishedAt).toISOString(),
      })),
    );

    for (const entry of ranked) {
      const participant = participants.find((item) => item.id === entry.participantId);

      if (participant !== undefined) {
        participant.finalPosition = entry.position;
      }
    }
  }

  private recalculateTotals(participantId: string): void {
    const participant = this.participants.find((item) => item.id === participantId);

    if (participant === undefined) {
      return;
    }

    const participantRounds = this.participantRounds.filter(
      (item) => item.participantId === participantId,
    );
    const totalRounds = this.getRounds(participant.championshipId).length;
    const closed = participantRounds.filter((item) =>
      ["COMPLETED", "FAILED", "EXPIRED"].includes(item.status),
    );

    participant.totalScore = participantRounds.reduce((total, item) => total + item.totalScore, 0);
    participant.wordsSolved = participantRounds.reduce((total, item) => total + item.wordsSolved, 0);
    participant.totalAttempts = participantRounds.reduce(
      (total, item) => total + item.attemptsUsed,
      0,
    );
    participant.totalDurationMs = participantRounds.reduce(
      (total, item) => total + item.durationMs,
      0,
    );
    participant.completedRounds = participantRounds.filter((item) => item.allWordsSolved).length;

    const firstStart = participantRounds
      .map((item) => item.startedAt)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0];

    participant.startedAt = participant.startedAt ?? firstStart ?? null;

    // CANCELLED e ABANDONED sao terminais: o recalculo nunca os reverte.
    if (participant.status !== "CANCELLED" && participant.status !== "ABANDONED") {
      if (closed.length >= totalRounds && totalRounds > 0) {
        participant.status = "FINISHED";
        const lastFinish = participantRounds
          .map((item) => item.finishedAt)
          .filter((value): value is number => value !== null)
          .sort((left, right) => right - left)[0];
        participant.finishedAt = participant.finishedAt ?? lastFinish ?? this.now();
      } else if (participant.startedAt !== null) {
        participant.status = "IN_PROGRESS";
      }
    }
  }

  // -------------------------------------------------------------------
  // Jogador
  // -------------------------------------------------------------------

  upsertProfile(userId: string, displayName: string): void {
    const clean = displayName.trim();

    if (clean.length < 2 || clean.length > 24) {
      throw new ChampionshipError("INVALID_DISPLAY_NAME");
    }

    this.profiles.set(userId, { id: userId, displayName: clean, createdAt: this.now() });
  }

  register(userId: string, displayName: string, championshipId?: string): ChampionshipState {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    this.upsertProfile(userId, displayName);
    const championship = this.refreshStatus(target);
    const clean = displayName.trim();

    const allowed = isDailyOpenAllDay(championship)
      ? championship.status === "IN_PROGRESS"
      : championship.status === "REGISTRATION_OPEN" ||
        (this.allowLateRegistration &&
          (championship.status === "WAITING" || championship.status === "IN_PROGRESS"));

    if (!allowed) {
      throw new ChampionshipError("REGISTRATION_CLOSED");
    }

    const existing = this.participants.find(
      (item) => item.championshipId === target && item.userId === userId,
    );

    if (existing !== undefined) {
      if (existing.status === "CANCELLED") {
        existing.status = "REGISTERED";
      }
      return this.buildState(target, userId);
    }

    const nameTaken = this.participants.some(
      (item) =>
        item.championshipId === target &&
        item.displayName.trim().toLowerCase() === clean.toLowerCase(),
    );

    if (nameTaken) {
      throw new ChampionshipError("DISPLAY_NAME_TAKEN");
    }

    this.participants.push({
      id: this.nextId("participant"),
      championshipId: target,
      userId,
      displayName: clean,
      status: "REGISTERED",
      registeredAt: this.now(),
      startedAt: null,
      finishedAt: null,
      totalScore: 0,
      wordsSolved: 0,
      completedRounds: 0,
      totalAttempts: 0,
      totalDurationMs: 0,
      finalPosition: null,
    });

    return this.buildState(target, userId);
  }

  cancelRegistration(userId: string, championshipId?: string): ChampionshipState {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    const championship = this.refreshStatus(target);

    if (championship.status !== "REGISTRATION_OPEN" && championship.status !== "WAITING") {
      throw new ChampionshipError("CANCELLATION_NOT_ALLOWED");
    }

    const index = this.participants.findIndex(
      (item) => item.championshipId === target && item.userId === userId,
    );

    if (index >= 0) {
      this.participants.splice(index, 1);
    }

    return this.buildState(target, userId);
  }

  abandon(userId: string, championshipId?: string): ChampionshipState {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    const participant = this.findParticipant(target, userId);

    for (const participantRound of this.participantRounds) {
      if (
        participantRound.participantId === participant.id &&
        (participantRound.status === "NOT_STARTED" || participantRound.status === "IN_PROGRESS")
      ) {
        participantRound.status = "EXPIRED";
        participantRound.finishedAt = this.now();
      }
    }

    this.recalculateTotals(participant.id);
    participant.status = "ABANDONED";
    participant.finishedAt = participant.finishedAt ?? this.now();
    this.tryAutoFinish(target);

    return this.buildState(target, userId);
  }

  private findParticipant(championshipId: string, userId: string): EngineParticipant {
    const participant = this.participants.find(
      (item) => item.championshipId === championshipId && item.userId === userId,
    );

    if (participant === undefined || participant.status === "CANCELLED") {
      throw new ChampionshipError("NOT_REGISTERED");
    }

    return participant;
  }

  startRound(userId: string, roundId: string): ChampionshipState {
    const round = this.requireRound(roundId);
    const championship = this.refreshStatus(round.championshipId);

    if (championship.status !== "IN_PROGRESS") {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_IN_PROGRESS");
    }

    const participant = this.findParticipant(championship.id, userId);
    const previousRounds = this.getRounds(championship.id).filter(
      (item) => item.roundOrder < round.roundOrder,
    );

    const pending = previousRounds.some((previous) => {
      const participation = this.participantRounds.find(
        (item) => item.participantId === participant.id && item.roundId === previous.id,
      );
      return (
        participation === undefined ||
        !["COMPLETED", "FAILED", "EXPIRED"].includes(participation.status)
      );
    });

    if (pending) {
      throw new ChampionshipError("PREVIOUS_ROUND_PENDING");
    }

    let participation = this.participantRounds.find(
      (item) => item.participantId === participant.id && item.roundId === round.id,
    );

    if (participation === undefined) {
      participation = {
        id: this.nextId("participant-round"),
        participantId: participant.id,
        roundId: round.id,
        status: "IN_PROGRESS",
        startedAt: this.now(),
        finishedAt: null,
        attemptsUsed: 0,
        wordsSolved: 0,
        allWordsSolved: false,
        baseScore: 0,
        bonusScore: 0,
        totalScore: 0,
        durationMs: 0,
        attempts: [],
      };
      this.participantRounds.push(participation);
    } else if (participation.status === "NOT_STARTED") {
      participation.status = "IN_PROGRESS";
      participation.startedAt = participation.startedAt ?? this.now();
    }

    participant.startedAt = participant.startedAt ?? this.now();
    if (participant.status === "REGISTERED") {
      participant.status = "IN_PROGRESS";
    }

    return this.buildState(championship.id, userId);
  }

  submitAttempt(userId: string, roundId: string, word: string): ChampionshipState {
    const normalizedGuess = normalizeWord(word);

    if (normalizedGuess.length !== 5) {
      throw new ChampionshipError("INVALID_WORD_LENGTH");
    }

    if (!this.validWords.has(normalizedGuess)) {
      throw new ChampionshipError("WORD_NOT_ACCEPTED");
    }

    const round = this.requireRound(roundId);
    const championship = this.refreshStatus(round.championshipId);

    if (championship.status !== "IN_PROGRESS") {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_IN_PROGRESS");
    }

    const participant = this.findParticipant(championship.id, userId);
    const participation = this.participantRounds.find(
      (item) => item.participantId === participant.id && item.roundId === round.id,
    );

    if (participation === undefined) {
      throw new ChampionshipError("ROUND_NOT_STARTED");
    }

    if (participation.status !== "IN_PROGRESS" && participation.status !== "NOT_STARTED") {
      throw new ChampionshipError("ROUND_ALREADY_FINISHED");
    }

    if (participation.attemptsUsed >= round.maxAttempts) {
      throw new ChampionshipError("NO_ATTEMPTS_LEFT");
    }

    if (participation.attempts.some((attempt) => attempt.normalizedWord === normalizedGuess)) {
      throw new ChampionshipError("DUPLICATE_ATTEMPT");
    }

    const attemptNumber = participation.attemptsUsed + 1;
    const roundAnswers = this.answers
      .filter((item) => item.roundId === round.id)
      .sort((left, right) => left.boardIndex - right.boardIndex);

    const boards: EngineAttempt["boards"] = [];
    let solvedTotal = 0;

    for (const answer of roundAnswers) {
      const alreadySolved = participation.attempts.some((attempt) =>
        attempt.boards.some(
          (board) => board.boardIndex === answer.boardIndex && board.solved,
        ),
      );

      if (alreadySolved) {
        solvedTotal += 1;
        continue;
      }

      const letters = evaluateGuess(normalizedGuess, answer.answer);
      const solved = normalizedGuess === answer.normalizedAnswer;

      if (solved) {
        solvedTotal += 1;
      }

      boards.push({ boardIndex: answer.boardIndex, solved, letters });
    }

    participation.attempts.push({ attemptNumber, normalizedWord: normalizedGuess, boards });
    participation.attemptsUsed = attemptNumber;
    participation.wordsSolved = solvedTotal;
    participation.allWordsSolved = solvedTotal >= round.boardCount;

    const roundFinished =
      participation.allWordsSolved || attemptNumber >= round.maxAttempts;

    if (roundFinished) {
      const score = calculateRoundScore(
        {
          wordsSolved: solvedTotal,
          totalWords: round.boardCount,
          attemptsUsed: attemptNumber,
          maxAttempts: round.maxAttempts,
        },
        CHAMPIONSHIP_SCORING,
      );

      participation.baseScore = score.baseScore;
      participation.bonusScore = score.bonusScore;
      participation.totalScore = score.totalScore;
      participation.status = participation.allWordsSolved ? "COMPLETED" : "FAILED";
      participation.finishedAt = this.now();
      participation.durationMs =
        participation.startedAt === null
          ? 0
          : Math.max(participation.finishedAt - participation.startedAt, 0);

      this.recalculateTotals(participant.id);
      this.tryAutoFinish(championship.id);
    } else {
      participation.status = "IN_PROGRESS";
      participation.durationMs =
        participation.startedAt === null ? 0 : Math.max(this.now() - participation.startedAt, 0);
    }

    return this.buildState(championship.id, userId);
  }

  // -------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------

  buildState(championshipId: string | null, userId: string | null): ChampionshipState {
    const timestamp = new Date(this.now()).toISOString();

    if (championshipId === null) {
      return {
        now: timestamp,
        championship: null,
        profile: null,
        participant: null,
        rounds: [],
        currentRoundId: null,
      };
    }

    const championship = this.refreshStatus(championshipId);
    const isFinished =
      championship.status === "FINISHED" || championship.status === "CANCELLED";
    const participant =
      userId === null
        ? undefined
        : this.participants.find(
            (item) => item.championshipId === championshipId && item.userId === userId,
          );

    const rounds: ChampionshipRoundState[] = [];
    let previousClosed = true;
    let currentRoundId: string | null = null;

    for (const round of this.getRounds(championshipId)) {
      const participation =
        participant === undefined
          ? undefined
          : this.participantRounds.find(
              (item) => item.participantId === participant.id && item.roundId === round.id,
            );
      const status: ParticipantRoundStatus = participation?.status ?? "NOT_STARTED";
      const roundClosed = ["COMPLETED", "FAILED", "EXPIRED"].includes(status);
      const revealAnswers = isFinished || roundClosed;
      const unlocked =
        championship.status === "IN_PROGRESS" &&
        previousClosed &&
        participant !== undefined &&
        participant.status !== "CANCELLED";

      const boards: ChampionshipBoard[] = [];

      for (let boardIndex = 0; boardIndex < round.boardCount; boardIndex += 1) {
        const rows: EvaluatedLetter[][] = [];
        let solved = false;

        for (const attempt of participation?.attempts ?? []) {
          for (const board of attempt.boards) {
            if (board.boardIndex !== boardIndex) {
              continue;
            }
            rows.push(board.letters);
            solved = solved || board.solved;
          }
        }

        const answer = this.answers.find(
          (item) => item.roundId === round.id && item.boardIndex === boardIndex,
        );

        boards.push({
          boardIndex,
          solved,
          answer: revealAnswers || solved ? (answer?.answer ?? null) : null,
          rows,
        });
      }

      rounds.push({
        id: round.id,
        mode: round.mode,
        roundOrder: round.roundOrder,
        boardCount: round.boardCount,
        maxAttempts: round.maxAttempts,
        timeLimitSeconds: round.timeLimitSeconds,
        unlocked,
        status,
        attemptsUsed: participation?.attemptsUsed ?? 0,
        wordsSolved: participation?.wordsSolved ?? 0,
        allWordsSolved: participation?.allWordsSolved ?? false,
        baseScore: participation?.baseScore ?? 0,
        bonusScore: participation?.bonusScore ?? 0,
        totalScore: participation?.totalScore ?? 0,
        durationMs: participation?.durationMs ?? 0,
        startedAt: toIso(participation?.startedAt ?? null),
        finishedAt: toIso(participation?.finishedAt ?? null),
        boards,
      });

      if (currentRoundId === null && unlocked && !roundClosed) {
        currentRoundId = round.id;
      }

      previousClosed = previousClosed && roundClosed;
    }

    const profile = userId === null ? undefined : this.profiles.get(userId);

    return {
      now: timestamp,
      championship: {
        id: championship.id,
        name: championship.name,
        championshipDate: championship.championshipDate,
        timezone: championship.timezone,
        registrationOpensAt: new Date(championship.registrationOpensAt).toISOString(),
        registrationClosesAt: new Date(championship.registrationClosesAt).toISOString(),
        startsAt: new Date(championship.startsAt).toISOString(),
        finishedAt: toIso(championship.finishedAt),
        status: championship.status,
        participantCount: this.participants.filter(
          (item) => item.championshipId === championshipId && item.status !== "CANCELLED",
        ).length,
      },
      profile:
        profile === undefined
          ? null
          : {
              id: profile.id,
              displayName: profile.displayName,
              createdAt: new Date(profile.createdAt).toISOString(),
            },
      participant:
        participant === undefined
          ? null
          : {
              id: participant.id,
              displayName: participant.displayName,
              status: participant.status,
              registeredAt: new Date(participant.registeredAt).toISOString(),
              startedAt: toIso(participant.startedAt),
              finishedAt: toIso(participant.finishedAt),
              totalScore: participant.totalScore,
              wordsSolved: participant.wordsSolved,
              completedRounds: participant.completedRounds,
              totalAttempts: participant.totalAttempts,
              totalDurationMs: participant.totalDurationMs,
              finalPosition: participant.finalPosition,
            },
      rounds,
      currentRoundId,
    };
  }

  getLeaderboard(championshipId?: string): Leaderboard {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      return { championshipId: null, isFinal: false, entries: [] };
    }

    const championship = this.refreshStatus(target);
    const participants = this.participants.filter(
      (item) => item.championshipId === target && item.status !== "CANCELLED",
    );
    const isFinal = championship.status === "FINISHED";

    if (!isFinal) {
      return {
        championshipId: target,
        championshipName: championship.name,
        championshipDate: championship.championshipDate,
        status: championship.status,
        isFinal: false,
        entries: [...participants]
          .sort((left, right) => left.registeredAt - right.registeredAt)
          .map((participant) => ({
            participantId: participant.id,
            userId: participant.userId,
            position: null,
            displayName: participant.displayName,
            totalScore: null,
            wordsSolved: null,
            completedRounds: participant.completedRounds,
            totalAttempts: null,
            totalDurationMs: null,
            status: participant.status,
          })),
      };
    }

    const ranked = rankParticipants(
      participants.map((participant) => ({
        participantId: participant.id,
        userId: participant.userId,
        displayName: participant.displayName,
        totalScore: participant.totalScore,
        wordsSolved: participant.wordsSolved,
        completedRounds: participant.completedRounds,
        totalAttempts: participant.totalAttempts,
        totalDurationMs: participant.totalDurationMs,
        finishedAt: toIso(participant.finishedAt),
        status: participant.status,
      })),
    );

    return {
      championshipId: target,
      championshipName: championship.name,
      championshipDate: championship.championshipDate,
      status: championship.status,
      isFinal: true,
      entries: ranked.map((entry) => ({
        participantId: entry.participantId,
        userId: entry.userId,
        position: entry.position,
        displayName: entry.displayName,
        totalScore: entry.totalScore,
        wordsSolved: entry.wordsSolved,
        completedRounds: entry.completedRounds,
        totalAttempts: entry.totalAttempts,
        totalDurationMs: entry.totalDurationMs,
        status: entry.status,
      })),
    };
  }

  getWeeklyLeaderboard(weekStart?: string): Leaderboard {
    const reference = weekStart ?? getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE);
    const start = startOfIsoWeek(reference);
    const end = addDaysIso(start, 4); // Segunda a Sexta
    const weekChampionships = [...this.championships.values()].filter(
      (championship) =>
        (championship.isOfficial || championship.name === "Campeonato Norte") &&
        championship.status !== "CANCELLED" &&
        championship.championshipDate >= start &&
        championship.championshipDate <= end,
    );
    const totals = new Map<
      string,
      {
        userId: string;
        displayName: string;
        totalScore: number;
        wordsSolved: number;
        completedRounds: number;
        totalAttempts: number;
        totalDurationMs: number;
        status: ParticipationStatus;
        dailyBreakdown: Record<
          string,
          { wordsSolved: number | null; wordsTotal: number; score: number | null; played: boolean }
        >;
      }
    >();

    const dayCols = getWeekDayColumns(start);

    for (const championship of weekChampionships) {
      const participants = this.participants.filter(
        (participant) =>
          participant.championshipId === championship.id &&
          participant.status !== "CANCELLED" &&
          (participant.status === "FINISHED" ||
            participant.completedRounds > 0 ||
            participant.totalScore > 0 ||
            participant.startedAt !== null),
      );

      for (const participant of participants) {
        const current = totals.get(participant.userId) ?? {
          userId: participant.userId,
          displayName: participant.displayName,
          totalScore: 0,
          wordsSolved: 0,
          completedRounds: 0,
          totalAttempts: 0,
          totalDurationMs: 0,
          status: "FINISHED" as ParticipationStatus,
          dailyBreakdown: {},
        };

        current.displayName = participant.displayName;
        current.totalScore += participant.totalScore;
        current.wordsSolved += participant.wordsSolved;
        current.completedRounds += participant.completedRounds;
        current.totalAttempts += participant.totalAttempts;
        current.totalDurationMs += participant.totalDurationMs;

        const played =
          participant.status === "FINISHED" ||
          participant.completedRounds > 0 ||
          participant.totalScore > 0 ||
          participant.startedAt !== null;

        current.dailyBreakdown[championship.championshipDate] = {
          wordsSolved: played ? participant.wordsSolved : null,
          wordsTotal: 13,
          score: played ? participant.totalScore : null,
          played,
        };

        totals.set(participant.userId, current);
      }
    }

    const ranked = [...totals.values()]
      .sort((left, right) => {
        return (
          right.totalScore - left.totalScore ||
          right.wordsSolved - left.wordsSolved ||
          right.completedRounds - left.completedRounds ||
          left.totalAttempts - right.totalAttempts ||
          left.totalDurationMs - right.totalDurationMs ||
          left.userId.localeCompare(right.userId)
        );
      })
      .map((entry, index) => {
        const days: WeeklyDayProgress[] = dayCols.map((col) => {
          const dayInfo = entry.dailyBreakdown[col.date];
          return {
            date: col.date,
            weekday: col.weekday,
            label: col.headerLabel,
            wordsSolved: dayInfo?.played ? (dayInfo.wordsSolved ?? 0) : null,
            wordsTotal: 13,
            score: dayInfo?.played ? dayInfo.score : null,
            played: !!dayInfo?.played,
          };
        });

        return {
          participantId: entry.userId,
          userId: entry.userId,
          position: index + 1,
          displayName: entry.displayName,
          totalScore: entry.totalScore,
          wordsSolved: entry.wordsSolved,
          completedRounds: entry.completedRounds,
          totalAttempts: entry.totalAttempts,
          totalDurationMs: entry.totalDurationMs,
          status: entry.status,
          dailyBreakdown: entry.dailyBreakdown,
          days,
        };
      });

    const isFinal = getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE) > end;

    return {
      championshipId: null,
      championshipName: "Campeonato Norte",
      period: "weekly",
      periodLabel: formatNorteWeekRange(start, end),
      weekStart: start,
      weekEnd: end,
      totalWords: 65, // 5 rodadas x 13 palavras
      totalRounds: 20, // 5 rodadas x 4 modalidades
      status: isFinal ? "FINISHED" : "IN_PROGRESS",
      isFinal,
      entries: ranked,
    };
  }

  getResults(championshipId?: string, currentUserId?: string | null): ChampionshipResults {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    const championship = this.refreshStatus(target);

    if (championship.status !== "FINISHED") {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FINISHED");
    }

    const leaderboard = this.getLeaderboard(target);

    return {
      championship: {
        id: championship.id,
        name: championship.name,
        championshipDate: championship.championshipDate,
        status: championship.status,
        startsAt: new Date(championship.startsAt).toISOString(),
        finishedAt: toIso(championship.finishedAt),
        timezone: championship.timezone,
      },
      rounds: this.getRounds(target).map((round) => ({
        roundId: round.id,
        mode: round.mode,
        roundOrder: round.roundOrder,
        boardCount: round.boardCount,
        maxAttempts: round.maxAttempts,
        answers: this.answers
          .filter((item) => item.roundId === round.id)
          .sort((left, right) => left.boardIndex - right.boardIndex)
          .map((item) => item.answer),
      })),
      participants: leaderboard.entries.map((entry) => ({
        ...entry,
        // Privacidade: detalhamento de rodadas APENAS para o usuario dono
        rounds: currentUserId && entry.userId === currentUserId
          ? this.getRounds(target).map((round) => {
              const participation = this.participantRounds.find(
                (item) => item.participantId === entry.participantId && item.roundId === round.id,
              );

              return {
                mode: round.mode,
                roundOrder: round.roundOrder,
                status: participation?.status ?? "NOT_STARTED",
                attemptsUsed: participation?.attemptsUsed ?? 0,
                attemptsLeft: Math.max(round.maxAttempts - (participation?.attemptsUsed ?? 0), 0),
                wordsSolved: participation?.wordsSolved ?? 0,
                totalWords: round.boardCount,
                allWordsSolved: participation?.allWordsSolved ?? false,
                baseScore: participation?.baseScore ?? 0,
                bonusScore: participation?.bonusScore ?? 0,
                totalScore: participation?.totalScore ?? 0,
                durationMs: participation?.durationMs ?? 0,
              };
            })
          : [],
      })),
    };
  }

  getHistory(userId: string | null, limit = 20, offset = 0): ChampionshipHistoryItem[] {
    return [...this.championships.values()]
      .filter((championship) => championship.status === "FINISHED")
      .sort((left, right) => right.startsAt - left.startsAt)
      .slice(offset, offset + limit)
      .map((championship) => {
        const participants = this.participants.filter(
          (item) => item.championshipId === championship.id && item.status !== "CANCELLED",
        );
        const mine = participants.find((item) => item.userId === userId);

        return {
          championshipId: championship.id,
          name: championship.name,
          championshipDate: championship.championshipDate,
          startsAt: new Date(championship.startsAt).toISOString(),
          finishedAt: toIso(championship.finishedAt),
          durationMs:
            championship.finishedAt === null
              ? null
              : championship.finishedAt - championship.startsAt,
          participantCount: participants.length,
          podium: participants
            .filter((item) => item.finalPosition !== null && item.finalPosition <= 3)
            .sort((left, right) => (left.finalPosition ?? 0) - (right.finalPosition ?? 0))
            .map((item) => ({
              position: item.finalPosition ?? 0,
              displayName: item.displayName,
              totalScore: item.totalScore,
              wordsSolved: item.wordsSolved,
            })),
          answers: this.answers
            .filter((item) => item.championshipId === championship.id)
            .map((item) => item.answer),
          myResult:
            mine === undefined
              ? null
              : {
                  position: mine.finalPosition,
                  totalScore: mine.totalScore,
                  wordsSolved: mine.wordsSolved,
                  completedRounds: mine.completedRounds,
                },
        };
      });
  }

  getPlayerStats(userId: string): ChampionshipPlayerStats {
    const mine = this.participants.filter((item) => {
      const championship = this.championships.get(item.championshipId);
      return item.userId === userId && championship?.status === "FINISHED";
    });

    if (mine.length === 0) {
      return {
        championshipsPlayed: 0,
        wins: 0,
        podiums: 0,
        bestScore: 0,
        averageScore: 0,
        averagePosition: 0,
        totalWordsSolved: 0,
        bestDurationMs: null,
      };
    }

    const positions = mine
      .map((item) => item.finalPosition)
      .filter((value): value is number => value !== null);
    const durations = mine.map((item) => item.totalDurationMs).filter((value) => value > 0);

    return {
      championshipsPlayed: mine.length,
      wins: mine.filter((item) => item.finalPosition === 1).length,
      podiums: mine.filter((item) => item.finalPosition !== null && item.finalPosition <= 3).length,
      bestScore: Math.max(...mine.map((item) => item.totalScore)),
      averageScore: Math.round(
        mine.reduce((total, item) => total + item.totalScore, 0) / mine.length,
      ),
      averagePosition:
        positions.length === 0
          ? 0
          : Number(
              (positions.reduce((total, value) => total + value, 0) / positions.length).toFixed(2),
            ),
      totalWordsSolved: mine.reduce((total, item) => total + item.wordsSolved, 0),
      bestDurationMs: durations.length === 0 ? null : Math.min(...durations),
    };
  }

  /**
   * Visao do painel administrativo.
   * Nunca inclui respostas: para isso existe adminAnswers().
   */
  getAdminOverview(userId: string | null, championshipId?: string): AdminOverview {
    this.requireAdmin(userId);

    const serverNow = new Date(this.now()).toISOString();
    const today = getZonedToday(serverNow, CHAMPIONSHIP_TIMEZONE);
    const todayId = this.getTodayChampionshipId(today);
    const target = championshipId ?? todayId ?? null;
    const emptyCounters = {
      registered: 0,
      started: 0,
      playing: 0,
      finished: 0,
      abandoned: 0,
    };

    if (target === null) {
      return {
        serverNow,
        today,
        timezone: CHAMPIONSHIP_TIMEZONE,
        hasChampionshipToday: false,
        isToday: false,
        championship: null,
        counters: emptyCounters,
        rounds: [],
        participants: [],
        wordPoolSize: this.answerPool.length,
        validWordCount: this.validWords.size,
      };
    }

    const championship = this.refreshStatus(target);
    const participants = this.participants.filter((item) => item.championshipId === target);
    const active = participants.filter((item) => item.status !== "CANCELLED");

    return {
      serverNow,
      today,
      timezone: CHAMPIONSHIP_TIMEZONE,
      hasChampionshipToday: todayId !== null,
      isToday: championship.championshipDate === today,
      championship: {
        id: championship.id,
        name: championship.name,
        championshipDate: championship.championshipDate,
        timezone: championship.timezone,
        status: championship.status,
        isOfficial: championship.isOfficial,
        registrationOpensAt: new Date(championship.registrationOpensAt).toISOString(),
        registrationClosesAt: new Date(championship.registrationClosesAt).toISOString(),
        startsAt: new Date(championship.startsAt).toISOString(),
        finishedAt: toIso(championship.finishedAt),
        createdAt: new Date(championship.createdAt).toISOString(),
        actualStartedAt: toIso(championship.actualStartedAt),
        answerCount: this.answers.filter((item) => item.championshipId === target).length,
        expectedAnswerCount: this.getRounds(target).reduce(
          (total, round) => total + round.boardCount,
          0,
        ),
      },
      counters: {
        registered: active.length,
        started: active.filter((item) => item.startedAt !== null).length,
        playing: participants.filter((item) => item.status === "IN_PROGRESS").length,
        finished: participants.filter((item) => item.status === "FINISHED").length,
        abandoned: participants.filter((item) => item.status === "ABANDONED").length,
      },
      rounds: this.getRounds(target).map((round) => {
        const participations = this.participantRounds.filter(
          (item) =>
            item.roundId === round.id &&
            active.some((participant) => participant.id === item.participantId),
        );

        return {
          id: round.id,
          mode: round.mode,
          roundOrder: round.roundOrder,
          boardCount: round.boardCount,
          maxAttempts: round.maxAttempts,
          status:
            championship.status === "FINISHED" || championship.status === "CANCELLED"
              ? ("CLOSED" as const)
              : championship.status === "IN_PROGRESS"
                ? ("ACTIVE" as const)
                : ("PENDING" as const),
          startsAt:
            championship.status === "IN_PROGRESS" || championship.status === "FINISHED"
              ? toIso(championship.actualStartedAt)
              : null,
          endsAt: null,
          answerCount: this.answers.filter((item) => item.roundId === round.id).length,
          notStarted:
            active.length -
            participations.filter((item) => item.status !== "NOT_STARTED").length,
          inProgress: participations.filter((item) => item.status === "IN_PROGRESS").length,
          completed: participations.filter((item) =>
            ["COMPLETED", "FAILED", "EXPIRED"].includes(item.status),
          ).length,
        };
      }),
      participants: participants
        .slice()
        .sort(
          (left, right) =>
            (left.finalPosition ?? Number.MAX_SAFE_INTEGER) -
              (right.finalPosition ?? Number.MAX_SAFE_INTEGER) ||
            right.totalScore - left.totalScore ||
            left.registeredAt - right.registeredAt,
        )
        .map((item) => {
          const currentRound = this.participantRounds
            .filter(
              (participation) =>
                participation.participantId === item.id &&
                participation.status === "IN_PROGRESS",
            )
            .map((participation) =>
              this.rounds.find((round) => round.id === participation.roundId),
            )
            .filter((round): round is EngineRound => round !== undefined)
            .sort((left, right) => left.roundOrder - right.roundOrder)[0];

          return {
            id: item.id,
            displayName: item.displayName,
            status: item.status,
            registeredAt: new Date(item.registeredAt).toISOString(),
            startedAt: toIso(item.startedAt),
            finishedAt: toIso(item.finishedAt),
            completedRounds: item.completedRounds,
            wordsSolved: item.wordsSolved,
            totalScore: item.totalScore,
            totalAttempts: item.totalAttempts,
            totalDurationMs: item.totalDurationMs,
            finalPosition: item.finalPosition,
            currentRoundMode: currentRound?.mode ?? null,
            currentRoundOrder: currentRound?.roundOrder ?? null,
          };
        }),
      wordPoolSize: this.answerPool.length,
      validWordCount: this.validWords.size,
    };
  }
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function getSaoPauloDayStart(dateIso: string): number {
  return Date.parse(`${dateIso}T00:00:00-03:00`);
}

function getSaoPauloDayEnd(dateIso: string): number {
  return getSaoPauloDayStart(addDaysIso(dateIso, 1));
}

function isDailyOpenAllDay(championship: EngineChampionship): boolean {
  return championship.registrationClosesAt > championship.startsAt;
}

function getPlayableEnd(championship: EngineChampionship, maxDurationMs: number): number {
  return isDailyOpenAllDay(championship)
    ? championship.registrationClosesAt
    : championship.startsAt + maxDurationMs;
}

function startOfIsoWeek(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Adaptador que expoe o motor local com a mesma interface do servico real.
 * Cada instancia representa um usuario, o que permite simular varios
 * participantes concorrentes sobre o mesmo motor.
 */
export class LocalChampionshipService implements ChampionshipService {
  constructor(
    private readonly engine: LocalChampionshipEngine,
    private userId: string | null = null,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  isAuthenticated(): boolean {
    return this.userId !== null;
  }

  async signIn(displayName: string): Promise<void> {
    this.userId = this.userId ?? `local-user-${Math.random().toString(36).slice(2, 10)}`;
    this.engine.upsertProfile(this.userId, displayName);
  }

  signOut(): void {
    this.userId = null;
  }

  private requireUser(): string {
    if (this.userId === null) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }
    return this.userId;
  }

  async getState(championshipId?: string): Promise<ChampionshipState> {
    return this.engine.buildState(
      championshipId ?? this.engine.getCurrentChampionshipId(),
      this.userId,
    );
  }

  async register(displayName: string, championshipId?: string): Promise<ChampionshipState> {
    await this.signIn(displayName);
    return this.engine.register(this.requireUser(), displayName, championshipId);
  }

  async cancelRegistration(championshipId?: string): Promise<ChampionshipState> {
    return this.engine.cancelRegistration(this.requireUser(), championshipId);
  }

  async abandon(championshipId?: string): Promise<ChampionshipState> {
    return this.engine.abandon(this.requireUser(), championshipId);
  }

  async startRound(roundId: string): Promise<ChampionshipState> {
    return this.engine.startRound(this.requireUser(), roundId);
  }

  async submitAttempt(roundId: string, word: string): Promise<ChampionshipState> {
    return this.engine.submitAttempt(this.requireUser(), roundId, word);
  }

  async getLeaderboard(championshipId?: string): Promise<Leaderboard> {
    return this.engine.getLeaderboard(championshipId);
  }

  async getWeeklyLeaderboard(weekStart?: string): Promise<Leaderboard> {
    return this.engine.getWeeklyLeaderboard(weekStart);
  }

  async getResults(championshipId?: string): Promise<ChampionshipResults> {
    return this.engine.getResults(championshipId, this.userId);
  }

  async getHistory(limit = 20, offset = 0): Promise<ChampionshipHistoryItem[]> {
    return this.engine.getHistory(this.userId, limit, offset);
  }

  async getPlayerStats(): Promise<ChampionshipPlayerStats> {
    return this.engine.getPlayerStats(this.requireUser());
  }

  async getAdminOverview(championshipId?: string): Promise<AdminOverview> {
    return this.engine.getAdminOverview(this.userId, championshipId);
  }

  async createChampionship(input: CreateChampionshipInput = {}): Promise<{ championshipId: string }> {
    this.engine.requireAdmin(this.userId);
    return { championshipId: this.engine.createChampionship(input).id };
  }

  async createNextChampionship(): Promise<CreateNextChampionshipResult> {
    this.engine.requireAdmin(this.userId);
    return this.engine.createNextChampionship();
  }

  async setChampionshipStatus(
    championshipId: string,
    status: ChampionshipStatus,
  ): Promise<void> {
    this.engine.requireAdmin(this.userId);
    this.engine.setStatus(championshipId, status);
  }

  async redrawWords(championshipId: string): Promise<{ wordsDrawn: number }> {
    this.engine.requireAdmin(this.userId);
    return { wordsDrawn: this.engine.drawWords(championshipId) };
  }

  async recalculateRanking(championshipId: string): Promise<void> {
    this.engine.requireAdmin(this.userId);
    this.engine.consolidateRanking(championshipId);
  }

  async updateSchedule(
    championshipId: string,
    schedule: {
      registrationOpensAt?: string;
      registrationClosesAt?: string;
      startsAt?: string;
    },
  ): Promise<void> {
    const overview = this.engine.getAdminOverview(this.userId, championshipId);
    const current = overview.championship;

    if (current === null) {
      throw new ChampionshipError("CHAMPIONSHIP_NOT_FOUND");
    }

    this.engine.adminUpdateSchedule(this.userId, championshipId, {
      registrationOpensAt: schedule.registrationOpensAt ?? current.registrationOpensAt,
      registrationClosesAt: schedule.registrationClosesAt ?? current.registrationClosesAt,
      startsAt: schedule.startsAt ?? current.startsAt,
    });
  }

  // ---- Controles do painel administrativo -------------------------------

  async startChampionshipNow(championshipId: string): Promise<StartNowResult> {
    return this.engine.adminStartNow(this.userId, championshipId);
  }

  async updateChampionshipSchedule(
    championshipId: string,
    schedule: ChampionshipSchedule,
  ): Promise<void> {
    this.engine.adminUpdateSchedule(this.userId, championshipId, schedule);
  }

  async openRegistrationNow(championshipId: string): Promise<void> {
    this.engine.adminOpenRegistrationNow(this.userId, championshipId);
  }

  async closeRegistrationNow(championshipId: string): Promise<void> {
    this.engine.adminCloseRegistrationNow(this.userId, championshipId);
  }

  async scheduleStartIn(championshipId: string, minutes: number): Promise<void> {
    this.engine.adminScheduleStartIn(this.userId, championshipId, minutes);
  }

  async cancelChampionship(championshipId: string): Promise<void> {
    this.engine.adminCancel(this.userId, championshipId);
  }

  async finishChampionship(championshipId: string): Promise<void> {
    this.engine.adminFinish(this.userId, championshipId);
  }

  async getChampionshipAnswers(championshipId: string): Promise<AdminRoundAnswers[]> {
    return this.engine.adminAnswers(this.userId, championshipId);
  }

  async listPlayers(): Promise<AdminPlayer[]> {
    return this.engine.adminListPlayers(this.userId);
  }

  async getPlayerGames(
    targetUserId: string,
    limit = 40,
    offset = 0,
  ): Promise<AdminPlayerHistory> {
    return this.engine.adminPlayerGames(this.userId, targetUserId, limit, offset);
  }
}

export { CHAMPIONSHIP_MODE_ORDER };
