import { describe, expect, it } from "vitest";
import { compareParticipants, getPodium, rankParticipants } from "./ranking";
import type { RankableParticipant } from "./ranking";

function participant(overrides: Partial<RankableParticipant> = {}): RankableParticipant {
  return {
    participantId: "p-1",
    totalScore: 0,
    wordsSolved: 0,
    completedRounds: 0,
    totalAttempts: 0,
    totalDurationMs: 0,
    finishedAt: null,
    ...overrides,
  };
}

describe("rankParticipants", () => {
  it("ordena pela maior pontuacao total", () => {
    const ranked = rankParticipants([
      participant({ participantId: "b", totalScore: 900 }),
      participant({ participantId: "a", totalScore: 1200 }),
      participant({ participantId: "c", totalScore: 1000 }),
    ]);

    expect(ranked.map((entry) => entry.participantId)).toEqual(["a", "c", "b"]);
    expect(ranked.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it("empate na pontuacao vai para palavras descobertas", () => {
    const ranked = rankParticipants([
      participant({ participantId: "a", totalScore: 1000, wordsSolved: 9 }),
      participant({ participantId: "b", totalScore: 1000, wordsSolved: 10 }),
    ]);

    expect(ranked[0].participantId).toBe("b");
  });

  it("depois usa modalidades concluidas", () => {
    const ranked = rankParticipants([
      participant({ participantId: "a", totalScore: 1000, wordsSolved: 10, completedRounds: 2 }),
      participant({ participantId: "b", totalScore: 1000, wordsSolved: 10, completedRounds: 3 }),
    ]);

    expect(ranked[0].participantId).toBe("b");
  });

  it("depois usa a menor quantidade de tentativas", () => {
    const ranked = rankParticipants([
      participant({
        participantId: "a",
        totalScore: 1000,
        wordsSolved: 10,
        completedRounds: 3,
        totalAttempts: 30,
      }),
      participant({
        participantId: "b",
        totalScore: 1000,
        wordsSolved: 10,
        completedRounds: 3,
        totalAttempts: 26,
      }),
    ]);

    expect(ranked[0].participantId).toBe("b");
  });

  it("o tempo so decide depois de todos os outros criterios", () => {
    // 'lento' tem tempo pior, mas resolveu mais palavras: precisa vencer.
    const ranked = rankParticipants([
      participant({
        participantId: "rapido",
        totalScore: 1000,
        wordsSolved: 10,
        totalDurationMs: 60_000,
      }),
      participant({
        participantId: "lento",
        totalScore: 1000,
        wordsSolved: 11,
        totalDurationMs: 900_000,
      }),
    ]);

    expect(ranked[0].participantId).toBe("lento");
  });

  it("usa o tempo quando pontos, palavras, modalidades e tentativas empatam", () => {
    const base = {
      totalScore: 1000,
      wordsSolved: 10,
      completedRounds: 3,
      totalAttempts: 28,
    };
    const ranked = rankParticipants([
      participant({ participantId: "a", ...base, totalDurationMs: 500_000 }),
      participant({ participantId: "b", ...base, totalDurationMs: 400_000 }),
    ]);

    expect(ranked[0].participantId).toBe("b");
  });

  it("desempata pelo horario de conclusao quando tudo mais e igual", () => {
    const base = {
      totalScore: 1000,
      wordsSolved: 10,
      completedRounds: 3,
      totalAttempts: 28,
      totalDurationMs: 400_000,
    };
    const ranked = rankParticipants([
      participant({ participantId: "a", ...base, finishedAt: "2026-08-06T20:40:00.000Z" }),
      participant({ participantId: "b", ...base, finishedAt: "2026-08-06T20:35:00.000Z" }),
    ]);

    expect(ranked[0].participantId).toBe("b");
  });

  it("quem nao concluiu fica atras de quem concluiu, em empate absoluto", () => {
    const base = {
      totalScore: 500,
      wordsSolved: 5,
      completedRounds: 1,
      totalAttempts: 20,
      totalDurationMs: 100_000,
    };
    const ranked = rankParticipants([
      participant({ participantId: "aberto", ...base, finishedAt: null }),
      participant({ participantId: "fechado", ...base, finishedAt: "2026-08-06T21:00:00.000Z" }),
    ]);

    expect(ranked[0].participantId).toBe("fechado");
  });

  it("empate absoluto cai no criterio determinista do identificador", () => {
    const base = {
      totalScore: 100,
      wordsSolved: 1,
      completedRounds: 1,
      totalAttempts: 3,
      totalDurationMs: 1000,
      finishedAt: "2026-08-06T21:00:00.000Z",
    };
    const first = rankParticipants([
      participant({ participantId: "zzz", ...base }),
      participant({ participantId: "aaa", ...base }),
    ]);
    const second = rankParticipants([
      participant({ participantId: "aaa", ...base }),
      participant({ participantId: "zzz", ...base }),
    ]);

    expect(first.map((entry) => entry.participantId)).toEqual(["aaa", "zzz"]);
    expect(second.map((entry) => entry.participantId)).toEqual(["aaa", "zzz"]);
  });

  it("nao modifica o array recebido", () => {
    const entries = [
      participant({ participantId: "a", totalScore: 10 }),
      participant({ participantId: "b", totalScore: 20 }),
    ];
    rankParticipants(entries);

    expect(entries[0].participantId).toBe("a");
  });
});

describe("compareParticipants", () => {
  it("retorna zero para participantes identicos", () => {
    const value = participant({ participantId: "a" });
    expect(compareParticipants(value, { ...value })).toBe(0);
  });
});

describe("getPodium", () => {
  it("devolve no maximo tres colocados, na ordem certa", () => {
    const podium = getPodium([
      participant({ participantId: "d", totalScore: 100 }),
      participant({ participantId: "a", totalScore: 400 }),
      participant({ participantId: "b", totalScore: 300 }),
      participant({ participantId: "c", totalScore: 200 }),
    ]);

    expect(podium).toHaveLength(3);
    expect(podium.map((entry) => entry.participantId)).toEqual(["a", "b", "c"]);
  });
});
