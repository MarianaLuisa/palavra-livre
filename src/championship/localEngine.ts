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
import { ChampionshipError } from "./errors";
import { rankParticipants } from "./ranking";
import { calculateRoundScore } from "./scoring";
import type { CreateChampionshipInput, ChampionshipService } from "./service";
import type {
  AdminOverview,
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

export type LocalEngineOptions = {
  answerPool?: string[];
  validWords?: string[];
  now?: () => number;
  random?: () => number;
  allowLateRegistration?: boolean;
  maxDurationMinutes?: number;
};

export class LocalChampionshipEngine {
  private readonly championships = new Map<string, EngineChampionship>();
  private readonly rounds: EngineRound[] = [];
  private readonly answers: EngineAnswer[] = [];
  private readonly participants: EngineParticipant[] = [];
  private readonly participantRounds: EngineParticipantRound[] = [];
  private readonly profiles = new Map<string, { id: string; displayName: string; createdAt: number }>();
  private readonly answerPool: string[];
  private readonly validWords: Set<string>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly allowLateRegistration: boolean;
  private readonly maxDurationMs: number;
  private idCounter = 0;

  constructor(options: LocalEngineOptions = {}) {
    this.answerPool = options.answerPool ?? (answersData as string[]);
    this.validWords = new Set(
      (options.validWords ?? (validWordsData as string[])).map(normalizeWord),
    );
    for (const word of this.answerPool) {
      this.validWords.add(normalizeWord(word));
    }
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.allowLateRegistration = options.allowLateRegistration ?? false;
    this.maxDurationMs = (options.maxDurationMinutes ?? 180) * 60_000;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------
  // Administracao
  // -------------------------------------------------------------------

  createChampionship(input: CreateChampionshipInput = {}): EngineChampionship {
    const startsAt = input.startsAt !== undefined
      ? Date.parse(input.startsAt)
      : this.now() + 60_000;
    const registrationOpensAt = input.registrationOpensAt !== undefined
      ? Date.parse(input.registrationOpensAt)
      : startsAt - 3_600_000;
    const registrationClosesAt = input.registrationClosesAt !== undefined
      ? Date.parse(input.registrationClosesAt)
      : startsAt - 1000;
    const championshipDate =
      input.championshipDate ?? new Date(startsAt).toISOString().slice(0, 10);

    if (
      [...this.championships.values()].some(
        (item) => item.championshipDate === championshipDate && item.status !== "CANCELLED",
      )
    ) {
      throw new ChampionshipError("UNKNOWN", "Ja existe campeonato oficial nesta data.");
    }

    const championship: EngineChampionship = {
      id: this.nextId("championship"),
      name: input.name ?? "Campeonato Diario",
      championshipDate,
      timezone: CHAMPIONSHIP_TIMEZONE,
      registrationOpensAt,
      registrationClosesAt,
      startsAt,
      finishedAt: null,
      status: "SCHEDULED",
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

  private getRounds(championshipId: string): EngineRound[] {
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

  getCurrentChampionshipId(): string | null {
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

    if (currentTime >= championship.startsAt) {
      championship.status = "IN_PROGRESS";
    } else if (currentTime >= championship.registrationClosesAt) {
      championship.status = "WAITING";
    } else if (currentTime >= championship.registrationOpensAt) {
      championship.status = "REGISTRATION_OPEN";
    } else {
      championship.status = "SCHEDULED";
    }

    if (championship.status === "IN_PROGRESS") {
      this.tryAutoFinish(championshipId);
    }

    return championship;
  }

  private tryAutoFinish(championshipId: string): boolean {
    const championship = this.requireChampionship(championshipId);

    if (championship.status !== "IN_PROGRESS") {
      return false;
    }

    if (this.now() >= championship.startsAt + this.maxDurationMs) {
      this.finishChampionship(championshipId);
      return true;
    }

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

    const allowed =
      championship.status === "REGISTRATION_OPEN" ||
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

  getResults(championshipId?: string): ChampionshipResults {
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
        rounds: this.getRounds(target).map((round) => {
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
        }),
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

  getAdminOverview(championshipId?: string): AdminOverview {
    const target = championshipId ?? this.getCurrentChampionshipId();

    if (target === null) {
      return { championship: null, rounds: [], participants: [] };
    }

    const championship = this.refreshStatus(target);

    return {
      championship: {
        id: championship.id,
        name: championship.name,
        championship_date: championship.championshipDate,
        status: championship.status,
        registration_opens_at: new Date(championship.registrationOpensAt).toISOString(),
        registration_closes_at: new Date(championship.registrationClosesAt).toISOString(),
        starts_at: new Date(championship.startsAt).toISOString(),
        finished_at: toIso(championship.finishedAt),
        timezone: championship.timezone,
      },
      rounds: this.getRounds(target).map((round) => ({
        id: round.id,
        mode: round.mode,
        roundOrder: round.roundOrder,
        boardCount: round.boardCount,
        maxAttempts: round.maxAttempts,
        status:
          championship.status === "FINISHED"
            ? "CLOSED"
            : championship.status === "IN_PROGRESS"
              ? "ACTIVE"
              : "PENDING",
        answerCount: this.answers.filter((item) => item.roundId === round.id).length,
        answers:
          championship.status === "FINISHED"
            ? this.answers
                .filter((item) => item.roundId === round.id)
                .sort((left, right) => left.boardIndex - right.boardIndex)
                .map((item) => item.answer)
            : null,
      })),
      participants: this.participants
        .filter((item) => item.championshipId === target)
        .map((item) => ({
          id: item.id,
          displayName: item.displayName,
          status: item.status,
          registeredAt: new Date(item.registeredAt).toISOString(),
          completedRounds: item.completedRounds,
          totalScore: item.totalScore,
          finalPosition: item.finalPosition,
        })),
      wordPoolSize: this.answerPool.length,
      validWordCount: this.validWords.size,
    };
  }
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
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

  async getResults(championshipId?: string): Promise<ChampionshipResults> {
    return this.engine.getResults(championshipId);
  }

  async getHistory(limit = 20, offset = 0): Promise<ChampionshipHistoryItem[]> {
    return this.engine.getHistory(this.userId, limit, offset);
  }

  async getPlayerStats(): Promise<ChampionshipPlayerStats> {
    return this.engine.getPlayerStats(this.requireUser());
  }

  async getAdminOverview(championshipId?: string): Promise<AdminOverview> {
    return this.engine.getAdminOverview(championshipId);
  }

  async createChampionship(input: CreateChampionshipInput = {}): Promise<{ championshipId: string }> {
    return { championshipId: this.engine.createChampionship(input).id };
  }

  async setChampionshipStatus(
    championshipId: string,
    status: ChampionshipStatus,
  ): Promise<void> {
    this.engine.setStatus(championshipId, status);
  }

  async redrawWords(championshipId: string): Promise<{ wordsDrawn: number }> {
    return { wordsDrawn: this.engine.drawWords(championshipId) };
  }

  async recalculateRanking(championshipId: string): Promise<void> {
    this.engine.consolidateRanking(championshipId);
  }

  async updateSchedule(): Promise<void> {
    throw new ChampionshipError("SCHEDULE_UPDATE_NOT_ALLOWED");
  }
}

export { CHAMPIONSHIP_MODE_ORDER };
