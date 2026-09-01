import type { EvaluatedLetter, GameMode } from "../types/game";

/** Modalidades do campeonato, na ordem obrigatoria de disputa. */
export type ChampionshipMode = "SIMPLE" | "DUET" | "QUARTET" | "SEXTET";

export type ChampionshipStatus =
  | "SCHEDULED"
  | "REGISTRATION_OPEN"
  | "WAITING"
  | "IN_PROGRESS"
  | "CALCULATING_RESULTS"
  | "FINISHED"
  | "CANCELLED";

export type ParticipationStatus =
  | "REGISTERED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "ABANDONED"
  | "CANCELLED";

export type ParticipantRoundStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type ChampionshipProfile = {
  id: string;
  displayName: string;
  createdAt: string;
};

export type ChampionshipSummary = {
  id: string;
  name: string;
  championshipDate: string;
  timezone: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  startsAt: string;
  finishedAt: string | null;
  status: ChampionshipStatus;
  participantCount: number;
};

export type ParticipantSummary = {
  id: string;
  displayName: string;
  status: ParticipationStatus;
  registeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalScore: number;
  wordsSolved: number;
  completedRounds: number;
  totalAttempts: number;
  totalDurationMs: number;
  finalPosition: number | null;
};

/**
 * Tabuleiro visto pelo participante.
 * `answer` so vem preenchido quando o tabuleiro foi resolvido,
 * quando a rodada terminou ou quando o campeonato foi encerrado.
 */
export type ChampionshipBoard = {
  boardIndex: number;
  solved: boolean;
  answer: string | null;
  rows: EvaluatedLetter[][];
};

export type ChampionshipRoundState = {
  id: string;
  mode: ChampionshipMode;
  roundOrder: number;
  boardCount: number;
  maxAttempts: number;
  timeLimitSeconds: number | null;
  unlocked: boolean;
  status: ParticipantRoundStatus;
  attemptsUsed: number;
  wordsSolved: number;
  allWordsSolved: boolean;
  baseScore: number;
  bonusScore: number;
  totalScore: number;
  durationMs: number;
  startedAt: string | null;
  finishedAt: string | null;
  boards: ChampionshipBoard[];
};

/** Estado completo devolvido pelo servidor a cada interacao. */
export type ChampionshipState = {
  now: string;
  championship: ChampionshipSummary | null;
  profile: ChampionshipProfile | null;
  participant: ParticipantSummary | null;
  rounds: ChampionshipRoundState[];
  currentRoundId: string | null;
};

export type WeeklyDayProgress = {
  date: string;
  weekday: number;
  label: string;
  wordsSolved: number | null;
  wordsTotal: number;
  score: number | null;
  played: boolean;
};

export type LeaderboardEntry = {
  participantId?: string;
  userId?: string;
  position?: number | null;
  displayName: string;
  totalScore?: number | null;
  wordsSolved?: number | null;
  completedRounds?: number;
  totalAttempts?: number | null;
  totalDurationMs?: number | null;
  status?: ParticipationStatus;
  dailyBreakdown?: Record<string, { wordsSolved: number | null; wordsTotal: number; score: number | null; played: boolean }>;
  days?: WeeklyDayProgress[];
};

export type Leaderboard = {
  championshipId: string | null;
  championshipName?: string;
  championshipDate?: string;
  period?: "daily" | "weekly";
  periodLabel?: string;
  weekStart?: string;
  weekEnd?: string;
  totalWords?: number | null;
  totalRounds?: number | null;
  status?: ChampionshipStatus;
  isFinal: boolean;
  entries: LeaderboardEntry[];
  participants?: LeaderboardEntry[];
};

export type ResultRoundBreakdown = {
  mode: ChampionshipMode;
  roundOrder: number;
  status: ParticipantRoundStatus;
  attemptsUsed: number;
  attemptsLeft: number;
  wordsSolved: number;
  totalWords: number;
  allWordsSolved: boolean;
  baseScore: number;
  bonusScore: number;
  totalScore: number;
  durationMs: number;
};

export type ResultParticipant = LeaderboardEntry & {
  rounds: ResultRoundBreakdown[];
};

export type ChampionshipResults = {
  championship: {
    id: string;
    name: string;
    championshipDate: string;
    status: ChampionshipStatus;
    startsAt: string;
    finishedAt: string | null;
    timezone: string;
  };
  rounds: Array<{
    roundId: string;
    mode: ChampionshipMode;
    roundOrder: number;
    boardCount: number;
    maxAttempts: number;
    answers: string[];
  }>;
  participants: ResultParticipant[];
};

export type ChampionshipHistoryItem = {
  championshipId: string;
  name: string;
  championshipDate: string;
  startsAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  participantCount: number;
  podium: Array<{
    position: number;
    displayName: string;
    totalScore: number;
    wordsSolved: number;
  }>;
  answers: string[];
  myResult: {
    position: number | null;
    totalScore: number;
    wordsSolved: number;
    completedRounds: number;
  } | null;
};

export type ChampionshipPlayerStats = {
  championshipsPlayed: number;
  wins: number;
  podiums: number;
  bestScore: number;
  averageScore: number;
  averagePosition: number;
  totalWordsSolved: number;
  bestDurationMs: number | null;
};

export type AdminRoundOverview = {
  id: string;
  mode: ChampionshipMode;
  roundOrder: number;
  boardCount: number;
  maxAttempts: number;
  status: "PENDING" | "ACTIVE" | "CLOSED";
  startsAt: string | null;
  endsAt: string | null;
  answerCount: number;
  /** Participantes que ainda nao abriram esta modalidade. */
  notStarted: number;
  /** Participantes jogando esta modalidade agora. */
  inProgress: number;
  /** Participantes que ja fecharam esta modalidade. */
  completed: number;
};

export type AdminChampionship = {
  id: string;
  name: string;
  championshipDate: string;
  timezone: string;
  status: ChampionshipStatus;
  isOfficial: boolean;
  registrationOpensAt: string;
  registrationClosesAt: string;
  startsAt: string;
  finishedAt: string | null;
  createdAt: string;
  /** Instante real em que a primeira rodada foi ativada. */
  actualStartedAt: string | null;
  answerCount: number;
  expectedAnswerCount: number;
};

export type AdminParticipant = {
  id: string;
  displayName: string;
  status: ParticipationStatus;
  registeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  completedRounds: number;
  wordsSolved: number;
  totalScore: number;
  totalAttempts: number;
  totalDurationMs: number;
  finalPosition: number | null;
  /** Modalidade que a pessoa esta jogando agora, se houver. */
  currentRoundMode: ChampionshipMode | null;
  currentRoundOrder: number | null;
};

export type AdminCounters = {
  registered: number;
  started: number;
  playing: number;
  finished: number;
  abandoned: number;
};

export type AdminOverview = {
  /** Horario oficial do servidor. O painel nunca usa o relogio do navegador. */
  serverNow: string;
  /** Data de hoje no fuso do campeonato. */
  today: string;
  timezone: string;
  /** Existe campeonato oficial criado para hoje. */
  hasChampionshipToday: boolean;
  /** O campeonato exibido e o de hoje. */
  isToday: boolean;
  championship: AdminChampionship | null;
  counters: AdminCounters;
  rounds: AdminRoundOverview[];
  participants: AdminParticipant[];
  wordPoolSize?: number;
  validWordCount?: number;
};

/** Respostas do campeonato, obtidas por RPC dedicada apos o encerramento. */
export type AdminRoundAnswers = {
  roundId: string;
  mode: ChampionshipMode;
  roundOrder: number;
  answers: string[];
};

/** Horarios editaveis, ja em instantes absolutos (ISO 8601). */
export type ChampionshipSchedule = {
  registrationOpensAt: string;
  registrationClosesAt: string;
  startsAt: string;
};

/** Ponte entre a modalidade do campeonato e o modo do jogo livre. */
export const CHAMPIONSHIP_MODE_TO_GAME_MODE: Record<ChampionshipMode, GameMode> = {
  SIMPLE: "simple",
  DUET: "duet",
  QUARTET: "quartet",
  SEXTET: "sextet",
};

export const GAME_MODE_TO_CHAMPIONSHIP_MODE: Record<GameMode, ChampionshipMode> = {
  simple: "SIMPLE",
  duet: "DUET",
  quartet: "QUARTET",
  sextet: "SEXTET",
};

/** Linha da aba de jogadores no painel administrativo. */
export type AdminPlayer = {
  userId: string;
  username: string | null;
  displayName: string;
  createdAt: string;
  /** Conta com e-mail e senha. O e-mail em si nunca chega ao frontend. */
  isPermanent: boolean;
  isAdmin: boolean;
  dailyGoal: number;

  games: number;
  completedGames: number;
  completionRate: number;
  wordsSolved: number;
  attempts: number;
  durationMs: number;
  activeDays: number;
  lastPlayedDate: string | null;

  championshipsPlayed: number;
  championshipWins: number;
  championshipPodiums: number;
  championshipBestPosition: number | null;
  championshipBestScore: number;
  lastChampionshipDate: string | null;
};

/** Partida na linha do tempo de um jogador, das duas origens. */
export type AdminPlayerGameEntry = {
  source: "FREE_PLAY" | "CHAMPIONSHIP";
  date: string;
  finishedAt: string | null;
  mode: ChampionshipMode | null;
  attemptsUsed: number;
  maxAttempts: number | null;
  wordsSolved: number;
  wordsTotal: number;
  completed: boolean;
  durationMs: number;
  position: number | null;
  totalScore: number | null;
  completedRounds?: number;
  championshipStatus?: string;
};

export type AdminPlayerHistory = {
  userId: string;
  username: string | null;
  displayName: string;
  entries: AdminPlayerGameEntry[];
};
