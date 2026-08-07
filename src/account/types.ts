import type { ChampionshipMode } from "../championship/types";

/** Perfil publico do jogador. Nunca contem e-mail nem dado de autenticacao. */
export type PlayerProfile = {
  id: string;
  username: string | null;
  displayName: string;
  createdAt: string;
  /** Conta com e-mail e senha, em oposicao a sessao anonima. */
  isPermanent: boolean;
  isAdmin: boolean;
};

export type SignUpInput = {
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type SignUpResult =
  | { status: "SIGNED_IN" }
  /** Projeto exige confirmacao por e-mail antes do primeiro login. */
  | { status: "CONFIRMATION_REQUIRED" };

export type StreakInfo = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  /** Jogou ontem e ainda nao jogou hoje: a sequencia zera se o dia passar. */
  atRisk: boolean;
};

export type ModeStatsEntry = {
  mode: ChampionshipMode;
  games: number;
  /** Partidas em que resolveu todas as palavras da modalidade. */
  completed: number;
  incomplete: number;
  completionRate: number;
  averageAttempts: number;
  /** Menor numero de tentativas numa partida completa. */
  bestAttempts: number | null;
  wordsSolved: number;
  wordsTotal: number;
  durationMs: number;
};

export type ChampionshipStatsSummary = {
  played: number;
  wins: number;
  podiums: number;
  bestPosition: number | null;
  bestScore: number;
  averageScore: number;
  wordsSolved: number;
  attempts: number;
  durationMs: number;
};

export type AggregateStats = {
  from: string | null;
  to: string | null;
  games: number;
  completedGames: number;
  incompleteGames: number;
  completionRate: number;
  wordsSolved: number;
  wordsTotal: number;
  attempts: number;
  averageAttempts: number;
  durationMs: number;
  averageDurationMs: number;
  activeDays: number;
  byMode: ModeStatsEntry[];
  championship: ChampionshipStatsSummary;
};

export type DayChampionshipResult = {
  championshipId: string;
  position: number | null;
  totalScore: number;
  wordsSolved: number;
  completedRounds: number;
  status: string;
};

export type ProgressDay = {
  date: string;
  games: number;
  completedGames: number;
  wordsSolved: number;
  attempts: number;
  durationMs: number;
  byMode: Record<ChampionshipMode, number>;
  championship: DayChampionshipResult | null;
};

export type MonthProgress = {
  month: string;
  monthEnd: string;
  today: string;
  timezone: string;
  daysInMonth: number;
  /** Dias que ja aconteceram no mes. No mes corrente, ate hoje. */
  daysPossible: number;
  isCurrentMonth: boolean;
  dailyGoal: number;
  streak: StreakInfo;
  days: ProgressDay[];
  /** Datas com campeonato oficial, tendo participado ou nao. */
  championshipDays: string[];
  summary: AggregateStats;
};

export type PlayerStats = {
  today: string;
  stats: AggregateStats;
  streak: StreakInfo;
  memberSince: string | null;
};

export type PeriodComparison = {
  first: AggregateStats;
  second: AggregateStats;
};

export type ChampionshipHistoryEntry = {
  championshipId: string;
  championshipDate: string;
  status: string;
  participantCount: number;
  participated: boolean;
  position: number | null;
  totalScore: number | null;
  wordsSolved: number | null;
  wordsTotal: number;
  attempts: number | null;
  durationMs: number | null;
  completedRounds: number | null;
};

export type HomeSummary = {
  serverNow: string;
  today: string;
  username: string | null;
  displayName: string;
  dailyGoal: number;
  todayGames: number;
  streak: StreakInfo;
  todayChampionship: {
    id: string;
    status: string;
    startsAt: string;
    registrationClosesAt: string;
    registered: boolean;
  } | null;
};

/** Partida do Jogo Livre pronta para registro no servidor. */
export type RecordGameInput = {
  /** Identificador criado quando a partida comeca. Garante idempotencia. */
  clientGameId: string;
  mode: ChampionshipMode;
  attemptsUsed: number;
  wordsSolved: number;
  durationMs: number;
  startedAt: string | null;
};

export type RecordGameResult = {
  gameId: string;
  playedDate: string;
  recorded: boolean;
  alreadyRecorded: boolean;
};

export type UsernameAvailability = {
  available: boolean;
  reason: "INVALID_USERNAME" | "USERNAME_TAKEN" | null;
};
