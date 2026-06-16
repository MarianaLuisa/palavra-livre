import type { GameMode, ModeStats, StoredStats } from "../types/game";
import { MODES } from "./constants";

function createEmptyModeStats(): ModeStats {
  return {
    played: 0,
    won: 0,
    lost: 0,
    currentStreak: 0,
    maxStreak: 0,
    totalGuesses: 0,
    winDistribution: {},
  };
}

export function createEmptyStats(): StoredStats {
  return MODES.reduce((stats, mode) => {
    stats[mode] = createEmptyModeStats();
    return stats;
  }, {} as StoredStats);
}

export function normalizeStats(stats: StoredStats | null): StoredStats {
  const fallbackStats = createEmptyStats();

  if (stats === null) {
    return fallbackStats;
  }

  return MODES.reduce((normalizedStats, mode) => {
    normalizedStats[mode] = {
      ...fallbackStats[mode],
      ...stats[mode],
      winDistribution: {
        ...fallbackStats[mode].winDistribution,
        ...stats[mode]?.winDistribution,
      },
    };
    return normalizedStats;
  }, {} as StoredStats);
}

export function recordFinishedGame(
  currentStats: StoredStats,
  mode: GameMode,
  won: boolean,
  attemptsUsed: number,
): StoredStats {
  const nextStats = normalizeStats(currentStats);
  const modeStats = nextStats[mode];
  const currentStreak = won ? modeStats.currentStreak + 1 : 0;
  const winDistribution = { ...modeStats.winDistribution };

  if (won) {
    const attemptKey = String(attemptsUsed);
    winDistribution[attemptKey] = (winDistribution[attemptKey] ?? 0) + 1;
  }

  nextStats[mode] = {
    played: modeStats.played + 1,
    won: modeStats.won + (won ? 1 : 0),
    lost: modeStats.lost + (won ? 0 : 1),
    currentStreak,
    maxStreak: Math.max(modeStats.maxStreak, currentStreak),
    totalGuesses: modeStats.totalGuesses + attemptsUsed,
    winDistribution,
  };

  return nextStats;
}
