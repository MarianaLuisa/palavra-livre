import { describe, expect, it } from "vitest";
import { sortLeaderboardEntries } from "./LeaderboardTable";
import { getWeekDayColumns } from "../weeklyChampionshipDomain";
import type { LeaderboardEntry } from "../types";

describe("LeaderboardTable - Colunas e Ordenação", () => {
  it("ordena participantes por pontuação decrescente e critérios de desempate", () => {
    const entries: LeaderboardEntry[] = [
      {
        participantId: "part-2",
        userId: "user-2",
        displayName: "Bernardo",
        totalScore: 800,
        wordsSolved: 8,
        completedRounds: 2,
        totalAttempts: 12,
        totalDurationMs: 90000,
        status: "FINISHED",
        position: null,
      },
      {
        participantId: "part-1",
        userId: "user-1",
        displayName: "Alice",
        totalScore: 1200,
        wordsSolved: 12,
        completedRounds: 4,
        totalAttempts: 15,
        totalDurationMs: 120000,
        status: "FINISHED",
        position: null,
      },
      {
        participantId: "part-3",
        userId: "user-3",
        displayName: "Carlos",
        totalScore: 800,
        wordsSolved: 8,
        completedRounds: 2,
        totalAttempts: 10, // Menos tentativas: desempata à frente do Bernardo
        totalDurationMs: 85000,
        status: "FINISHED",
        position: null,
      },
    ];

    const sorted = sortLeaderboardEntries(entries);

    expect(sorted[0].displayName).toBe("Alice");
    expect(sorted[1].displayName).toBe("Carlos");
    expect(sorted[2].displayName).toBe("Bernardo");
  });

  it("gera as 5 colunas de dias úteis da semana no formato correto: Seg (DD/MM) a Sex (DD/MM)", () => {
    const columns = getWeekDayColumns("2026-08-31");

    expect(columns).toHaveLength(5);
    expect(columns[0].headerLabel).toBe("Seg (31/08)");
    expect(columns[1].headerLabel).toBe("Ter (01/09)");
    expect(columns[2].headerLabel).toBe("Qua (02/09)");
    expect(columns[3].headerLabel).toBe("Qui (03/09)");
    expect(columns[4].headerLabel).toBe("Sex (04/09)");
  });

  it("processa com segurança o payload real da RPC cd_weekly_leaderboard com campos opcionais", () => {
    const backendPayloadEntries: LeaderboardEntry[] = [
      {
        position: 1,
        displayName: "Gabriele",
        totalScore: 2680,
        wordsSolved: 26,
        totalAttempts: 60,
        completedRounds: 8,
        totalDurationMs: 1705158,
      },
      {
        position: 2,
        displayName: "guilhermito_suarez",
        totalScore: 2590,
        wordsSolved: 25,
        totalAttempts: 59,
        completedRounds: 7,
        totalDurationMs: 2688949,
      },
      {
        position: 3,
        displayName: "munozzzh",
        totalScore: 2540,
        wordsSolved: 25,
        totalAttempts: 64,
        completedRounds: 7,
        totalDurationMs: 2054871,
      },
    ];

    const sorted = sortLeaderboardEntries(backendPayloadEntries);

    expect(sorted).toHaveLength(3);
    expect(sorted[0].displayName).toBe("Gabriele");
    expect(sorted[0].totalScore).toBe(2680);
    expect(sorted[0].wordsSolved).toBe(26);
    expect(sorted[1].displayName).toBe("guilhermito_suarez");
    expect(sorted[2].displayName).toBe("munozzzh");
  });

  it("mapeia perfeitamente o array days com acertos diários de Seg e Ter e traço nos dias não jogados", () => {
    const gabrieleWithDays: LeaderboardEntry = {
      position: 1,
      displayName: "Gabriele",
      totalScore: 2680,
      wordsSolved: 26,
      days: [
        { weekday: 1, date: "2026-08-31", played: true, wordsSolved: 13, wordsTotal: 13, score: 1340, label: "Seg (31/08)" },
        { weekday: 2, date: "2026-09-01", played: true, wordsSolved: 13, wordsTotal: 13, score: 1340, label: "Ter (01/09)" },
        { weekday: 3, date: "2026-09-02", played: false, wordsSolved: 0, wordsTotal: 13, score: 0, label: "Qua (02/09)" },
        { weekday: 4, date: "2026-09-03", played: false, wordsSolved: 0, wordsTotal: 13, score: 0, label: "Qui (03/09)" },
        { weekday: 5, date: "2026-09-04", played: false, wordsSolved: 0, wordsTotal: 13, score: 0, label: "Sex (04/09)" },
      ],
    };

    const columns = getWeekDayColumns("2026-08-31");
    expect(columns).toHaveLength(5);

    const seg = gabrieleWithDays.days?.find((d) => d.date === columns[0].date);
    expect(seg?.played).toBe(true);
    expect(seg?.wordsSolved).toBe(13);

    const ter = gabrieleWithDays.days?.find((d) => d.date === columns[1].date);
    expect(ter?.played).toBe(true);
    expect(ter?.wordsSolved).toBe(13);

    const qua = gabrieleWithDays.days?.find((d) => d.date === columns[2].date);
    expect(qua?.played).toBe(false);
  });
});
