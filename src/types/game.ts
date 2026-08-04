export type GameMode = "simple" | "duet" | "quartet" | "sextet";

export type LetterStatus = "correct" | "present" | "absent" | "empty";

export type GameStatus = "playing" | "won" | "lost";

export type ThemeMode = "dark" | "light";

export type EvaluatedLetter = {
  letter: string;
  status: LetterStatus;
};

export type BoardState = {
  answer: string;
  solved: boolean;
  rows: EvaluatedLetter[][];
};

export type ModeConfig = {
  label: string;
  boardCount: number;
  maxAttempts: number;
};

export type ModeStats = {
  played: number;
  won: number;
  lost: number;
  currentStreak: number;
  maxStreak: number;
  totalGuesses: number;
  winDistribution: Record<string, number>;
};

export type StoredStats = Record<GameMode, ModeStats>;

export type FinishedModeResult = {
  mode: GameMode;
  status: Exclude<GameStatus, "playing">;
  attemptsUsed: number;
  boards: BoardState[];
  finishedAt: string;
};

export type CycleResults = Partial<Record<GameMode, FinishedModeResult>>;

export type SavedGameProgress = {
  mode: GameMode;
  boards: BoardState[];
  currentGuessLetters: string[];
  activeTileIndex: number;
  attempt: number;
  status: GameStatus;
  updatedAt: string;
};

export type StoredGameProgress = Partial<Record<GameMode, SavedGameProgress>>;
