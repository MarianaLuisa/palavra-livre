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

export type LeaderboardEntry = {
  participantId: string;
  userId: string;
  position: number | null;
  displayName: string;
  totalScore: number | null;
  wordsSolved: number | null;
  completedRounds: number;
  totalAttempts: number | null;
  totalDurationMs: number | null;
  status: ParticipationStatus;
};

export type Leaderboard = {
  championshipId: string | null;
  championshipName?: string;
  championshipDate?: string;
  status?: ChampionshipStatus;
  isFinal: boolean;
  entries: LeaderboardEntry[];
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
  answerCount: number;
  answers: string[] | null;
};

export type AdminOverview = {
  championship: {
    id: string;
    name: string;
    championship_date: string;
    status: ChampionshipStatus;
    registration_opens_at: string;
    registration_closes_at: string;
    starts_at: string;
    finished_at: string | null;
    timezone: string;
  } | null;
  rounds: AdminRoundOverview[];
  participants: Array<{
    id: string;
    displayName: string;
    status: ParticipationStatus;
    registeredAt: string;
    completedRounds: number;
    totalScore: number;
    finalPosition: number | null;
  }>;
  wordPoolSize?: number;
  validWordCount?: number;
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
