import { describe, expect, it } from "vitest";
import { buildWeeklyChampionshipGroups } from "./championshipHistoryGrouping";

describe("championshipHistoryGrouping", () => {
  it("agrupa rodadas diárias por semana e preserva os dados da semana do Campeonato Norte", () => {
    const entries = [
      {
        championshipId: "day-1",
        championshipDate: "2026-08-03",
        status: "FINISHED",
        participantCount: 10,
        participated: true,
        position: 2,
        totalScore: 900,
        wordsSolved: 11,
        wordsTotal: 13,
        attempts: 10,
        durationMs: 150_000,
        completedRounds: 4,
      },
      {
        championshipId: "day-2",
        championshipDate: "2026-08-04",
        status: "FINISHED",
        participantCount: 12,
        participated: true,
        position: 1,
        totalScore: 1200,
        wordsSolved: 13,
        wordsTotal: 13,
        attempts: 8,
        durationMs: 120_000,
        completedRounds: 4,
      },
      {
        championshipId: "day-3",
        championshipDate: "2026-08-10",
        status: "FINISHED",
        participantCount: 8,
        participated: true,
        position: 3,
        totalScore: 700,
        wordsSolved: 9,
        wordsTotal: 13,
        attempts: 11,
        durationMs: 160_000,
        completedRounds: 4,
      },
    ];

    const grouped = buildWeeklyChampionshipGroups(entries);

    expect(grouped).toHaveLength(2);
    // Mais recente primeiro
    expect(grouped[0].weekStart).toBe("2026-08-10");
    expect(grouped[0].weekEnd).toBe("2026-08-14");
    expect(grouped[0].championshipName).toBe("Campeonato Norte");
    expect(grouped[0].weekLabel).toBe("Campeonato Norte — 10/08/2026 a 14/08/2026");
    expect(grouped[0].dateRangeLabel).toBe("10/08/2026 – 14/08/2026");

    expect(grouped[1].weekStart).toBe("2026-08-03");
    expect(grouped[1].weekEnd).toBe("2026-08-07");
    expect(grouped[1].weekLabel).toBe("Campeonato Norte — 03/08/2026 a 07/08/2026");
    expect(grouped[1].dateRangeLabel).toBe("03/08/2026 – 07/08/2026");
    expect(grouped[1].dailyCount).toBe(2);
    expect(grouped[1].totalScore).toBe(2100);
    expect(grouped[1].totalWordsSolved).toBe(24);
  });
});
