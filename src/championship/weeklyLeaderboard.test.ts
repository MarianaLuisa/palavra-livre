import { describe, expect, it } from "vitest";
import { LocalChampionshipEngine } from "./localEngine";

describe("Classificação Semanal em Tempo Real do Campeonato Norte", () => {
  it("acumula pontuação diária e atualiza o ranking semanal imediatamente após o término da rodada", () => {
    // Começa na Segunda-feira 2026-08-31
    const engine = new LocalChampionshipEngine(Date.parse("2026-08-31T10:00:00-03:00"));

    const mondayChampId = engine.ensureCurrentNorteRound("2026-08-31")!;
    expect(mondayChampId).toBeTruthy();

    const user1 = "user-alice";
    const user2 = "user-bob";

    engine.upsertProfile(user1, "Alice");
    engine.upsertProfile(user2, "Bob");

    // Alice e Bob se registram na Segunda
    engine.register(user1, "Alice", mondayChampId);
    engine.register(user2, "Bob", mondayChampId);

    // Alice joga a primeira rodada e pontua 400
    const mondayRounds = engine.getRounds(mondayChampId);
    engine.startRound(user1, mondayRounds[0].id);

    // Definir respostas controladas
    engine.setAnswers(mondayChampId, {
      SIMPLE: ["sagaz"],
      DUET: ["sagaz", "amigo"],
      QUARTET: ["sagaz", "amigo", "plena", "nobre"],
      SEXTET: ["sagaz", "amigo", "plena", "nobre", "termo", "vigor"],
    });

    engine.submitAttempt(user1, mondayRounds[0].id, "sagaz");

    // Verificar se Alice já aparece na classificação semanal imediatamente!
    const weeklyBoard = engine.getWeeklyLeaderboard("2026-08-31");

    expect(weeklyBoard.championshipName).toBe("Campeonato Norte");
    expect(weeklyBoard.periodLabel).toBe("31/08/2026 – 04/09/2026");
    expect(weeklyBoard.entries.length).toBeGreaterThan(0);

    const aliceEntry = weeklyBoard.entries.find((e) => e.userId === user1);
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry?.totalScore).toBeGreaterThan(0);
    expect(aliceEntry?.completedRounds).toBe(1);
    expect(aliceEntry?.position).toBe(1);

    // Terça-feira 2026-09-01
    engine.setTime(Date.parse("2026-09-01T10:00:00-03:00"));
    const tuesdayChampId = engine.ensureCurrentNorteRound("2026-09-01")!;

    engine.register(user1, "Alice", tuesdayChampId);
    engine.setAnswers(tuesdayChampId, {
      SIMPLE: ["sagaz"],
      DUET: ["sagaz", "amigo"],
      QUARTET: ["sagaz", "amigo", "plena", "nobre"],
      SEXTET: ["sagaz", "amigo", "plena", "nobre", "termo", "vigor"],
    });

    const tuesdayRounds = engine.getRounds(tuesdayChampId);
    engine.startRound(user1, tuesdayRounds[0].id);
    engine.submitAttempt(user1, tuesdayRounds[0].id, "sagaz");

    // O ranking semanal acumula as pontuações de Segunda + Terça
    const accumulatedBoard = engine.getWeeklyLeaderboard("2026-08-31");
    const aliceAccumulated = accumulatedBoard.entries.find((e) => e.userId === user1);

    expect(aliceAccumulated?.completedRounds).toBe(2);
    expect(aliceAccumulated?.totalScore).toBeGreaterThan(aliceEntry!.totalScore!);
    expect(aliceAccumulated?.days).toBeDefined();
    expect(aliceAccumulated?.days).toHaveLength(5);
    expect(aliceAccumulated?.days?.[0].label).toBe("Seg (31/08)");
    expect(aliceAccumulated?.days?.[0].played).toBe(true);
    expect(aliceAccumulated?.days?.[0].wordsSolved).toBe(1);
    expect(aliceAccumulated?.days?.[1].label).toBe("Ter (01/09)");
    expect(aliceAccumulated?.days?.[1].played).toBe(true);
    expect(aliceAccumulated?.days?.[1].wordsSolved).toBe(1);
    expect(aliceAccumulated?.days?.[2].label).toBe("Qua (02/09)");
    expect(aliceAccumulated?.days?.[2].played).toBe(false);
    expect(aliceAccumulated?.days?.[2].wordsSolved).toBeNull();

    // Chamando com a data de Terça ("2026-09-01") deve normalizar para a Segunda ("2026-08-31") e trazer ambos os dias
    const tuesdayRefBoard = engine.getWeeklyLeaderboard("2026-09-01");
    expect(tuesdayRefBoard.weekStart).toBe("2026-08-31");
    expect(tuesdayRefBoard.weekEnd).toBe("2026-09-04");
    expect(tuesdayRefBoard.entries).toHaveLength(1);
    expect(tuesdayRefBoard.entries[0].days?.[0].played).toBe(true);
    expect(tuesdayRefBoard.entries[0].days?.[1].played).toBe(true);
  });
});
