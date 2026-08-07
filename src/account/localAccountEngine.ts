import { CHAMPIONSHIP_TIMEZONE } from "../championship/config";
import { ChampionshipError } from "../championship/errors";
import { getZonedToday } from "../championship/timezone";
import type { ChampionshipMode } from "../championship/types";
import type { AccountService } from "./service";
import { isValidUsernameFormat } from "./username";
import type {
  AggregateStats,
  ChampionshipHistoryEntry,
  HomeSummary,
  ModeStatsEntry,
  MonthProgress,
  PeriodComparison,
  PlayerProfile,
  PlayerStats,
  ProgressDay,
  RecordGameInput,
  RecordGameResult,
  SignUpInput,
  SignUpResult,
  StreakInfo,
  UsernameAvailability,
} from "./types";

/**
 * Motor de contas e progresso em memoria.
 *
 * Espelha as regras das migrations 08, 09 e 10: unicidade de username,
 * idempotencia do registro de partida, validacao contra a configuracao
 * oficial do modo, calendario, sequencia e agregados.
 *
 * Serve aos testes e documenta as regras de forma executavel. Nao
 * substitui o backend: qualquer mudanca de regra precisa acontecer nos
 * dois lugares, e os testes quebram se divergirem.
 */

const MODE_SETUP: Record<ChampionshipMode, { boardCount: number; maxAttempts: number }> = {
  SIMPLE: { boardCount: 1, maxAttempts: 6 },
  DUET: { boardCount: 2, maxAttempts: 7 },
  QUARTET: { boardCount: 4, maxAttempts: 9 },
  SEXTET: { boardCount: 6, maxAttempts: 12 },
};

const MODE_ORDER: ChampionshipMode[] = ["SIMPLE", "DUET", "QUARTET", "SEXTET"];

/** Participacao no campeonato, lida da fonte da verdade do campeonato. */
export type ChampionshipParticipationRecord = {
  championshipId: string;
  championshipDate: string;
  championshipStatus: string;
  participationStatus: string;
  startedAt: string | null;
  finalPosition: number | null;
  totalScore: number;
  wordsSolved: number;
  totalAttempts: number;
  totalDurationMs: number;
  completedRounds: number;
  wordsTotal: number;
  participantCount: number;
};

/** O progresso deriva do campeonato em vez de duplicar os dados dele. */
export type ChampionshipActivitySource = {
  getParticipations(userId: string): ChampionshipParticipationRecord[];
  /** Campeonatos oficiais realizados, para o calendario e o historico. */
  getOfficialChampionships(): Array<{
    id: string;
    date: string;
    status: string;
    participantCount: number;
    wordsTotal: number;
  }>;
};

type EngineUser = {
  id: string;
  email: string | null;
  password: string | null;
  isAnonymous: boolean;
  confirmed: boolean;
};

type EngineProfile = {
  id: string;
  username: string | null;
  displayName: string;
  createdAt: number;
  dailyGoal: number;
};

type EngineGame = {
  id: string;
  userId: string;
  clientGameId: string;
  mode: ChampionshipMode;
  playedDate: string;
  startedAt: string | null;
  finishedAt: string;
  durationMs: number;
  attemptsUsed: number;
  maxAttempts: number;
  wordsTotal: number;
  wordsSolved: number;
  completed: boolean;
};

export type LocalAccountEngineOptions = {
  now?: () => number;
  /** Simula a confirmacao por e-mail ligada no projeto Supabase. */
  requireEmailConfirmation?: boolean;
  championshipSource?: ChampionshipActivitySource;
};

function toDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(date: string, days: number): string {
  const result = toDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const start = toDate(monthStart(date));
  start.setUTCMonth(start.getUTCMonth() + 1);
  start.setUTCDate(0);
  return start.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export class LocalAccountEngine {
  private readonly users = new Map<string, EngineUser>();
  private readonly profiles = new Map<string, EngineProfile>();
  private readonly games: EngineGame[] = [];
  private readonly admins = new Set<string>();
  private readonly now: () => number;
  private readonly requireEmailConfirmation: boolean;
  private championshipSource: ChampionshipActivitySource | null;
  private idCounter = 0;

  constructor(options: LocalAccountEngineOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.requireEmailConfirmation = options.requireEmailConfirmation ?? false;
    this.championshipSource = options.championshipSource ?? null;
  }

  setChampionshipSource(source: ChampionshipActivitySource): void {
    this.championshipSource = source;
  }

  addAdmin(userId: string): void {
    this.admins.add(userId);
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(6, "0")}`;
  }

  today(): string {
    return getZonedToday(new Date(this.now()).toISOString(), CHAMPIONSHIP_TIMEZONE);
  }

  // -------------------------------------------------------------------
  // Contas
  // -------------------------------------------------------------------

  /** Cria uma sessao anonima, como o campeonato ja fazia. */
  createAnonymousUser(displayName: string): string {
    const id = this.nextId("user");
    this.users.set(id, {
      id,
      email: null,
      password: null,
      isAnonymous: true,
      confirmed: true,
    });
    this.profiles.set(id, {
      id,
      username: null,
      displayName,
      createdAt: this.now(),
      dailyGoal: 3,
    });
    return id;
  }

  private usernameTaken(username: string, exceptUserId: string | null): boolean {
    const normalized = username.trim().toLowerCase();

    for (const profile of this.profiles.values()) {
      if (profile.id === exceptUserId) {
        continue;
      }

      if (profile.username !== null && profile.username.trim().toLowerCase() === normalized) {
        return true;
      }
    }

    return false;
  }

  checkUsername(username: string, currentUserId: string | null): UsernameAvailability {
    if (!isValidUsernameFormat(username)) {
      return { available: false, reason: "INVALID_USERNAME" };
    }

    if (this.usernameTaken(username, currentUserId)) {
      return { available: false, reason: "USERNAME_TAKEN" };
    }

    return { available: true, reason: null };
  }

  setUsername(userId: string, username: string): PlayerProfile {
    const clean = username.trim();

    if (!isValidUsernameFormat(clean)) {
      throw new ChampionshipError("INVALID_USERNAME");
    }

    // Unicidade garantida aqui, como o indice UNIQUE do banco.
    if (this.usernameTaken(clean, userId)) {
      throw new ChampionshipError("USERNAME_TAKEN");
    }

    const profile = this.profiles.get(userId);

    if (profile === undefined) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    const displayNameFollowsUsername =
      profile.username === null || profile.displayName === profile.username;

    profile.username = clean;

    if (displayNameFollowsUsername) {
      profile.displayName = clean;
    }

    return this.getProfile(userId)!;
  }

  signUp(input: SignUpInput): { userId: string; result: SignUpResult } {
    const email = input.email.trim().toLowerCase();

    if (!email.includes("@")) {
      throw new ChampionshipError("INVALID_EMAIL");
    }

    if (input.password !== input.passwordConfirmation) {
      throw new ChampionshipError("PASSWORD_MISMATCH");
    }

    if (input.password.length < 6) {
      throw new ChampionshipError("WEAK_PASSWORD");
    }

    for (const user of this.users.values()) {
      if (user.email === email) {
        throw new ChampionshipError("EMAIL_ALREADY_REGISTERED");
      }
    }

    const availability = this.checkUsername(input.username, null);

    if (!availability.available) {
      throw new ChampionshipError(availability.reason ?? "USERNAME_TAKEN");
    }

    const id = this.nextId("user");
    this.users.set(id, {
      id,
      email,
      password: input.password,
      isAnonymous: false,
      confirmed: !this.requireEmailConfirmation,
    });
    this.profiles.set(id, {
      id,
      username: input.username.trim(),
      displayName: input.username.trim(),
      createdAt: this.now(),
      dailyGoal: 3,
    });

    return {
      userId: id,
      result: this.requireEmailConfirmation
        ? { status: "CONFIRMATION_REQUIRED" }
        : { status: "SIGNED_IN" },
    };
  }

  /**
   * Converte uma sessao anonima em conta permanente.
   * O identificador do usuario NAO muda: e isso que preserva historico,
   * inscricoes no campeonato e acesso administrativo.
   */
  convertAnonymous(userId: string, input: SignUpInput): SignUpResult {
    const user = this.users.get(userId);

    if (user === undefined) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    const email = input.email.trim().toLowerCase();

    if (input.password !== input.passwordConfirmation) {
      throw new ChampionshipError("PASSWORD_MISMATCH");
    }

    if (input.password.length < 6) {
      throw new ChampionshipError("WEAK_PASSWORD");
    }

    for (const other of this.users.values()) {
      if (other.id !== userId && other.email === email) {
        throw new ChampionshipError("EMAIL_ALREADY_REGISTERED");
      }
    }

    this.setUsername(userId, input.username);

    user.email = email;
    user.password = input.password;
    user.isAnonymous = false;

    return { status: "SIGNED_IN" };
  }

  signIn(email: string, password: string): string {
    const normalized = email.trim().toLowerCase();

    for (const user of this.users.values()) {
      if (user.email === normalized) {
        if (user.password !== password) {
          throw new ChampionshipError("INVALID_CREDENTIALS");
        }

        if (!user.confirmed) {
          throw new ChampionshipError("EMAIL_NOT_CONFIRMED");
        }

        return user.id;
      }
    }

    throw new ChampionshipError("INVALID_CREDENTIALS");
  }

  confirmEmail(userId: string): void {
    const user = this.users.get(userId);

    if (user !== undefined) {
      user.confirmed = true;
    }
  }

  getProfile(userId: string): PlayerProfile | null {
    const profile = this.profiles.get(userId);
    const user = this.users.get(userId);

    if (profile === undefined || user === undefined) {
      return null;
    }

    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      createdAt: new Date(profile.createdAt).toISOString(),
      isPermanent: (user.email ?? "") !== "",
      isAdmin: this.admins.has(userId),
    };
  }

  setDailyGoal(userId: string, goal: number): void {
    if (!Number.isInteger(goal) || goal < 1 || goal > 20) {
      throw new ChampionshipError("INVALID_DAILY_GOAL");
    }

    const profile = this.profiles.get(userId);

    if (profile !== undefined) {
      profile.dailyGoal = goal;
    }
  }

  // -------------------------------------------------------------------
  // Partidas
  // -------------------------------------------------------------------

  /**
   * Registro idempotente de partida do Jogo Livre.
   * Os limites do modo vem da configuracao oficial, nunca do cliente.
   */
  recordGame(userId: string, input: RecordGameInput): RecordGameResult {
    if (this.users.get(userId) === undefined) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    const clientGameId = input.clientGameId.trim();

    if (clientGameId.length < 8 || clientGameId.length > 64) {
      throw new ChampionshipError("INVALID_GAME_ID");
    }

    const setup = MODE_SETUP[input.mode];

    if (setup === undefined) {
      throw new ChampionshipError("INVALID_GAME_MODE");
    }

    if (
      !Number.isInteger(input.attemptsUsed) ||
      input.attemptsUsed < 1 ||
      input.attemptsUsed > setup.maxAttempts
    ) {
      throw new ChampionshipError("INVALID_ATTEMPTS");
    }

    if (
      !Number.isInteger(input.wordsSolved) ||
      input.wordsSolved < 0 ||
      input.wordsSolved > setup.boardCount
    ) {
      throw new ChampionshipError("INVALID_WORDS_SOLVED");
    }

    const completed = input.wordsSolved === setup.boardCount;

    // Partida abandonada nao entra no historico nem conta como dia jogado.
    if (!completed && input.attemptsUsed < setup.maxAttempts) {
      throw new ChampionshipError("GAME_NOT_FINISHED");
    }

    const existing = this.games.find(
      (game) => game.userId === userId && game.clientGameId === clientGameId,
    );

    if (existing !== undefined) {
      return {
        gameId: existing.id,
        playedDate: existing.playedDate,
        recorded: false,
        alreadyRecorded: true,
      };
    }

    const game: EngineGame = {
      id: this.nextId("game"),
      userId,
      clientGameId,
      mode: input.mode,
      // Data decidida pelo servidor, no fuso oficial.
      playedDate: this.today(),
      startedAt: input.startedAt,
      finishedAt: new Date(this.now()).toISOString(),
      durationMs: Math.max(input.durationMs, 0),
      attemptsUsed: input.attemptsUsed,
      maxAttempts: setup.maxAttempts,
      wordsTotal: setup.boardCount,
      wordsSolved: input.wordsSolved,
      completed,
    };

    this.games.push(game);

    return {
      gameId: game.id,
      playedDate: game.playedDate,
      recorded: true,
      alreadyRecorded: false,
    };
  }

  /** Apenas para testes: histórico próprio, respeitando o dono. */
  getGames(userId: string): EngineGame[] {
    return this.games.filter((game) => game.userId === userId);
  }

  // -------------------------------------------------------------------
  // Progresso
  // -------------------------------------------------------------------

  private participations(userId: string): ChampionshipParticipationRecord[] {
    return (this.championshipSource?.getParticipations(userId) ?? []).filter(
      (item) =>
        item.startedAt !== null &&
        item.participationStatus !== "CANCELLED" &&
        item.championshipStatus !== "CANCELLED",
    );
  }

  activityDays(userId: string): string[] {
    const days = new Set<string>();

    for (const game of this.games) {
      if (game.userId === userId) {
        days.add(game.playedDate);
      }
    }

    for (const participation of this.participations(userId)) {
      days.add(participation.championshipDate);
    }

    return [...days].sort();
  }

  calculateStreak(userId: string): StreakInfo {
    const days = this.activityDays(userId);

    if (days.length === 0) {
      return { current: 0, longest: 0, lastActiveDate: null, atRisk: false };
    }

    const runs: Array<{ length: number; end: string }> = [];
    let runLength = 1;

    for (let index = 1; index <= days.length; index += 1) {
      const isConsecutive =
        index < days.length && daysBetween(days[index - 1], days[index]) === 1;

      if (isConsecutive) {
        runLength += 1;
      } else {
        runs.push({ length: runLength, end: days[index - 1] });
        runLength = 1;
      }
    }

    const today = this.today();
    const yesterday = addDays(today, -1);
    const lastActiveDate = days[days.length - 1];

    // A sequencia segue viva se a ultima atividade foi hoje ou ontem.
    const activeRun = runs.find((run) => run.end === today || run.end === yesterday);

    return {
      current: activeRun?.length ?? 0,
      longest: runs.reduce((longest, run) => Math.max(longest, run.length), 0),
      lastActiveDate,
      atRisk: lastActiveDate === yesterday,
    };
  }

  aggregateStats(userId: string, from: string | null, to: string | null): AggregateStats {
    const inRange = (date: string) =>
      (from === null || date >= from) && (to === null || date <= to);

    const games = this.games.filter(
      (game) => game.userId === userId && inRange(game.playedDate),
    );
    const participations = this.participations(userId).filter(
      (item) => item.championshipStatus === "FINISHED" && inRange(item.championshipDate),
    );
    const activeDays = this.activityDays(userId).filter(inRange);

    const byMode: ModeStatsEntry[] = MODE_ORDER.map((mode) => {
      const modeGames = games.filter((game) => game.mode === mode);
      const completedGames = modeGames.filter((game) => game.completed);
      const bestAttempts = completedGames.reduce<number | null>(
        (best, game) => (best === null ? game.attemptsUsed : Math.min(best, game.attemptsUsed)),
        null,
      );

      return {
        mode,
        games: modeGames.length,
        completed: completedGames.length,
        incomplete: modeGames.length - completedGames.length,
        completionRate:
          modeGames.length === 0
            ? 0
            : round1((completedGames.length * 100) / modeGames.length),
        averageAttempts:
          modeGames.length === 0
            ? 0
            : round1(
                modeGames.reduce((total, game) => total + game.attemptsUsed, 0) /
                  modeGames.length,
              ),
        bestAttempts,
        wordsSolved: modeGames.reduce((total, game) => total + game.wordsSolved, 0),
        wordsTotal: modeGames.reduce((total, game) => total + game.wordsTotal, 0),
        durationMs: modeGames.reduce((total, game) => total + game.durationMs, 0),
      };
    });

    const completedGames = games.filter((game) => game.completed).length;
    const positions = participations
      .map((item) => item.finalPosition)
      .filter((value): value is number => value !== null);

    return {
      from,
      to,
      games: games.length,
      completedGames,
      incompleteGames: games.length - completedGames,
      completionRate:
        games.length === 0 ? 0 : round1((completedGames * 100) / games.length),
      wordsSolved: games.reduce((total, game) => total + game.wordsSolved, 0),
      wordsTotal: games.reduce((total, game) => total + game.wordsTotal, 0),
      attempts: games.reduce((total, game) => total + game.attemptsUsed, 0),
      averageAttempts:
        games.length === 0
          ? 0
          : round1(games.reduce((total, game) => total + game.attemptsUsed, 0) / games.length),
      durationMs: games.reduce((total, game) => total + game.durationMs, 0),
      averageDurationMs:
        games.length === 0
          ? 0
          : Math.round(games.reduce((total, game) => total + game.durationMs, 0) / games.length),
      activeDays: activeDays.length,
      byMode,
      championship: {
        played: participations.length,
        wins: participations.filter((item) => item.finalPosition === 1).length,
        podiums: participations.filter(
          (item) => item.finalPosition !== null && item.finalPosition <= 3,
        ).length,
        bestPosition: positions.length === 0 ? null : Math.min(...positions),
        bestScore: participations.reduce((best, item) => Math.max(best, item.totalScore), 0),
        averageScore:
          participations.length === 0
            ? 0
            : Math.round(
                participations.reduce((total, item) => total + item.totalScore, 0) /
                  participations.length,
              ),
        wordsSolved: participations.reduce((total, item) => total + item.wordsSolved, 0),
        attempts: participations.reduce((total, item) => total + item.totalAttempts, 0),
        durationMs: participations.reduce((total, item) => total + item.totalDurationMs, 0),
      },
    };
  }

  getMonthProgress(userId: string, month?: string): MonthProgress {
    const today = this.today();
    const start = monthStart(month ?? today);
    const end = monthEnd(start);
    const profile = this.profiles.get(userId);

    const daysInMonth = daysBetween(start, end) + 1;
    const daysPossible =
      end > today ? Math.max(daysBetween(start, today) + 1, 0) : daysInMonth;

    const activeDays = this.activityDays(userId).filter(
      (date) => date >= start && date <= end,
    );

    const days: ProgressDay[] = activeDays.map((date) => {
      const dayGames = this.games.filter(
        (game) => game.userId === userId && game.playedDate === date,
      );
      const participation = this.participations(userId).find(
        (item) => item.championshipDate === date,
      );

      return {
        date,
        games: dayGames.length,
        completedGames: dayGames.filter((game) => game.completed).length,
        wordsSolved:
          dayGames.reduce((total, game) => total + game.wordsSolved, 0) +
          (participation?.wordsSolved ?? 0),
        attempts:
          dayGames.reduce((total, game) => total + game.attemptsUsed, 0) +
          (participation?.totalAttempts ?? 0),
        durationMs:
          dayGames.reduce((total, game) => total + game.durationMs, 0) +
          (participation?.totalDurationMs ?? 0),
        byMode: {
          SIMPLE: dayGames.filter((game) => game.mode === "SIMPLE").length,
          DUET: dayGames.filter((game) => game.mode === "DUET").length,
          QUARTET: dayGames.filter((game) => game.mode === "QUARTET").length,
          SEXTET: dayGames.filter((game) => game.mode === "SEXTET").length,
        },
        championship:
          participation === undefined
            ? null
            : {
                championshipId: participation.championshipId,
                position: participation.finalPosition,
                totalScore: participation.totalScore,
                wordsSolved: participation.wordsSolved,
                completedRounds: participation.completedRounds,
                status: participation.participationStatus,
              },
      };
    });

    return {
      month: start,
      monthEnd: end,
      today,
      timezone: CHAMPIONSHIP_TIMEZONE,
      daysInMonth,
      daysPossible,
      isCurrentMonth: start === monthStart(today),
      dailyGoal: profile?.dailyGoal ?? 3,
      streak: this.calculateStreak(userId),
      days,
      championshipDays: (this.championshipSource?.getOfficialChampionships() ?? [])
        .filter((item) => item.date >= start && item.date <= end && item.status !== "CANCELLED")
        .map((item) => item.date)
        .sort(),
      summary: this.aggregateStats(userId, start, end),
    };
  }

  getPlayerStats(userId: string, from: string | null, to: string | null): PlayerStats {
    const profile = this.profiles.get(userId);

    return {
      today: this.today(),
      stats: this.aggregateStats(userId, from, to),
      streak: this.calculateStreak(userId),
      memberSince: profile === undefined ? null : new Date(profile.createdAt).toISOString(),
    };
  }

  getChampionshipHistory(userId: string, limit: number, offset: number): ChampionshipHistoryEntry[] {
    const championships = (this.championshipSource?.getOfficialChampionships() ?? [])
      .filter((item) => item.status === "FINISHED")
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(offset, offset + limit);
    const mine = this.participations(userId);

    return championships.map((championship) => {
      const participation = mine.find((item) => item.championshipId === championship.id);

      return {
        championshipId: championship.id,
        championshipDate: championship.date,
        status: championship.status,
        participantCount: championship.participantCount,
        participated: participation !== undefined,
        position: participation?.finalPosition ?? null,
        totalScore: participation?.totalScore ?? null,
        wordsSolved: participation?.wordsSolved ?? null,
        wordsTotal: championship.wordsTotal,
        attempts: participation?.totalAttempts ?? null,
        durationMs: participation?.totalDurationMs ?? null,
        completedRounds: participation?.completedRounds ?? null,
      };
    });
  }

  getHomeSummary(userId: string): HomeSummary {
    const profile = this.profiles.get(userId);
    const today = this.today();

    return {
      serverNow: new Date(this.now()).toISOString(),
      today,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? "",
      dailyGoal: profile?.dailyGoal ?? 3,
      todayGames: this.games.filter(
        (game) => game.userId === userId && game.playedDate === today,
      ).length,
      streak: this.calculateStreak(userId),
      todayChampionship: null,
    };
  }
}

/**
 * Adaptador com a mesma interface do servico real.
 * Cada instancia representa uma sessao, o que permite simular dois
 * jogadores diferentes sobre o mesmo motor nos testes de seguranca.
 */
export class LocalAccountService implements AccountService {
  constructor(
    private readonly engine: LocalAccountEngine,
    private userId: string | null = null,
  ) {}

  /** Apenas para testes: quem esta usando esta sessao. */
  getUserId(): string | null {
    return this.userId;
  }

  isConfigured(): boolean {
    return true;
  }

  hasSession(): boolean {
    return this.userId !== null;
  }

  isAnonymousSession(): boolean {
    if (this.userId === null) {
      return false;
    }

    const profile = this.engine.getProfile(this.userId);
    return profile !== null && !profile.isPermanent;
  }

  private requireUser(): string {
    if (this.userId === null) {
      throw new ChampionshipError("NOT_AUTHENTICATED");
    }

    return this.userId;
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const { userId, result } = this.engine.signUp(input);

    if (result.status === "SIGNED_IN") {
      this.userId = userId;
    }

    return result;
  }

  async convertAnonymousAccount(input: SignUpInput): Promise<SignUpResult> {
    return this.engine.convertAnonymous(this.requireUser(), input);
  }

  async signIn(email: string, password: string): Promise<void> {
    this.userId = this.engine.signIn(email, password);
  }

  signOut(): void {
    this.userId = null;
  }

  async requestPasswordReset(): Promise<void> {
    // Sem efeito observavel no motor local: o envio e do Supabase.
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 6) {
      throw new ChampionshipError("WEAK_PASSWORD");
    }
  }

  async getProfile(): Promise<PlayerProfile | null> {
    return this.userId === null ? null : this.engine.getProfile(this.userId);
  }

  async setUsername(username: string): Promise<PlayerProfile> {
    return this.engine.setUsername(this.requireUser(), username);
  }

  async checkUsername(username: string): Promise<UsernameAvailability> {
    return this.engine.checkUsername(username, this.userId);
  }

  async setDailyGoal(goal: number): Promise<void> {
    this.engine.setDailyGoal(this.requireUser(), goal);
  }

  async recordGame(input: RecordGameInput): Promise<RecordGameResult> {
    return this.engine.recordGame(this.requireUser(), input);
  }

  async getMonthProgress(month?: string): Promise<MonthProgress> {
    return this.engine.getMonthProgress(this.requireUser(), month);
  }

  async getPlayerStats(from?: string | null, to?: string | null): Promise<PlayerStats> {
    return this.engine.getPlayerStats(this.requireUser(), from ?? null, to ?? null);
  }

  async comparePeriods(
    firstFrom: string,
    firstTo: string,
    secondFrom: string,
    secondTo: string,
  ): Promise<PeriodComparison> {
    const userId = this.requireUser();

    return {
      first: this.engine.aggregateStats(userId, firstFrom, firstTo),
      second: this.engine.aggregateStats(userId, secondFrom, secondTo),
    };
  }

  async getChampionshipHistory(limit = 30, offset = 0): Promise<ChampionshipHistoryEntry[]> {
    return this.engine.getChampionshipHistory(this.requireUser(), limit, offset);
  }

  async getHomeSummary(): Promise<HomeSummary> {
    return this.engine.getHomeSummary(this.requireUser());
  }
}
