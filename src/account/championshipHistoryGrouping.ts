import type { ChampionshipHistoryEntry } from "./types";
import {
  formatBrazilianDate,
  formatNorteWeekRange,
  formatNorteWeekTitle,
  getBrazilWeekEnd,
  getBrazilWeekStart,
} from "../championship/weeklyChampionshipDomain";

export type WeeklyChampionshipGroup = {
  championshipName: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  dateRangeLabel: string;
  dailyEntries: ChampionshipHistoryEntry[];
  dailyCount: number;
  totalScore: number;
  totalWordsSolved: number;
  totalAttempts: number;
  totalDurationMs: number;
  completedDays: number;
};

export function buildWeeklyChampionshipGroups(
  entries: ChampionshipHistoryEntry[],
): WeeklyChampionshipGroup[] {
  const grouped = new Map<string, WeeklyChampionshipGroup>();

  for (const entry of entries) {
    const weekStart = getBrazilWeekStart(entry.championshipDate);
    const weekEnd = getBrazilWeekEnd(weekStart);
    const key = `${weekStart}|${weekEnd}`;
    const current = grouped.get(key) ?? {
      championshipName: "Campeonato Norte",
      weekStart,
      weekEnd,
      weekLabel: formatNorteWeekTitle(weekStart, weekEnd),
      dateRangeLabel: formatNorteWeekRange(weekStart, weekEnd),
      dailyEntries: [],
      dailyCount: 0,
      totalScore: 0,
      totalWordsSolved: 0,
      totalAttempts: 0,
      totalDurationMs: 0,
      completedDays: 0,
    };

    current.dailyEntries.push(entry);
    current.dailyCount += 1;
    current.totalScore += entry.participated && entry.totalScore !== null ? entry.totalScore : 0;
    current.totalWordsSolved += entry.participated && entry.wordsSolved !== null ? entry.wordsSolved : 0;
    current.totalAttempts += entry.participated && entry.attempts !== null ? entry.attempts : 0;
    current.totalDurationMs += entry.participated && entry.durationMs !== null ? entry.durationMs : 0;
    if (entry.participated && entry.completedRounds === 4) {
      current.completedDays += 1;
    }
    grouped.set(key, current);
  }

  // Ordena dias de cada grupo em ordem crescente (segunda a sexta)
  for (const group of grouped.values()) {
    group.dailyEntries.sort((left, right) =>
      left.championshipDate.localeCompare(right.championshipDate),
    );
  }

  return [...grouped.values()].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart),
  );
}
