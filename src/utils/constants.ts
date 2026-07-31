import type { GameMode, LetterStatus, ModeConfig } from "../types/game";

export const WORD_LENGTH = 5;

export const MODE_CONFIG: Record<GameMode, ModeConfig> = {
  simple: {
    label: "Simples",
    boardCount: 1,
    maxAttempts: 6,
  },
  duet: {
    label: "Dueto",
    boardCount: 2,
    maxAttempts: 7,
  },
  quartet: {
    label: "Quarteto",
    boardCount: 4,
    maxAttempts: 9,
  },
  sextet: {
    label: "Sexteto",
    boardCount: 6,
    maxAttempts: 12,
  },
};

export const MODES = Object.keys(MODE_CONFIG) as GameMode[];

export const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export const STATUS_PRIORITY: Record<LetterStatus, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

export const MODE_STORAGE_KEY = "palavra-livre:mode";
export const STATS_STORAGE_KEY = "palavra-livre:stats";
export const THEME_STORAGE_KEY = "palavra-livre:theme";
export const CYCLE_RESULTS_STORAGE_KEY = "palavra-livre:cycle-results";
export const ANSWER_HISTORY_STORAGE_KEY = "palavra-livre:answer-history";
export const TILE_REVEAL_DELAY_MS = 130;
export const TILE_REVEAL_DURATION_MS = 660;
export const REVEAL_TOTAL_MS = TILE_REVEAL_DELAY_MS * (WORD_LENGTH - 1) + TILE_REVEAL_DURATION_MS;
