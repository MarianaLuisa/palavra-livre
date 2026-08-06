import { describe, expect, it } from "vitest";
import { CHAMPIONSHIP_SCORING } from "./config";
import { calculateChampionshipScore, calculateRoundScore } from "./scoring";

describe("calculateRoundScore", () => {
  it("da 100 pontos por palavra descoberta", () => {
    const score = calculateRoundScore({
      wordsSolved: 3,
      totalWords: 4,
      attemptsUsed: 9,
      maxAttempts: 9,
    });

    expect(score.baseScore).toBe(300);
    expect(score.bonusScore).toBe(0);
    expect(score.totalScore).toBe(300);
  });

  it("nao concede bonus quando falta alguma palavra, mesmo sobrando tentativas", () => {
    const score = calculateRoundScore({
      wordsSolved: 3,
      totalWords: 4,
      attemptsUsed: 5,
      maxAttempts: 9,
    });

    expect(score.attemptsLeft).toBe(4);
    expect(score.bonusScore).toBe(0);
    expect(score.totalScore).toBe(300);
  });

  it("aplica o exemplo oficial do Quarteto: 4 palavras em 6 tentativas = 430", () => {
    const score = calculateRoundScore({
      wordsSolved: 4,
      totalWords: 4,
      attemptsUsed: 6,
      maxAttempts: 9,
    });

    expect(score.attemptsLeft).toBe(3);
    expect(score.baseScore).toBe(400);
    expect(score.bonusScore).toBe(30);
    expect(score.totalScore).toBe(430);
  });

  it("nao gera bonus quando usa todas as tentativas e resolve tudo", () => {
    const score = calculateRoundScore({
      wordsSolved: 1,
      totalWords: 1,
      attemptsUsed: 6,
      maxAttempts: 6,
    });

    expect(score.bonusScore).toBe(0);
    expect(score.totalScore).toBe(100);
  });

  it("zera a pontuacao quando nao descobre nada", () => {
    const score = calculateRoundScore({
      wordsSolved: 0,
      totalWords: 6,
      attemptsUsed: 12,
      maxAttempts: 12,
    });

    expect(score.totalScore).toBe(0);
    expect(score.allWordsSolved).toBe(false);
  });

  it("nunca deixa tentativas restantes negativas", () => {
    const score = calculateRoundScore({
      wordsSolved: 2,
      totalWords: 2,
      attemptsUsed: 9,
      maxAttempts: 7,
    });

    expect(score.attemptsLeft).toBe(0);
    expect(score.bonusScore).toBe(0);
  });

  it("respeita regras de pontuacao customizadas", () => {
    const score = calculateRoundScore(
      { wordsSolved: 2, totalWords: 2, attemptsUsed: 5, maxAttempts: 7 },
      { pointsPerWord: 50, bonusPerRemainingAttempt: 5 },
    );

    expect(score.baseScore).toBe(100);
    expect(score.bonusScore).toBe(10);
    expect(score.totalScore).toBe(110);
  });

  it("rejeita entradas invalidas", () => {
    expect(() =>
      calculateRoundScore({
        wordsSolved: 5,
        totalWords: 4,
        attemptsUsed: 1,
        maxAttempts: 9,
      }),
    ).toThrow();

    expect(() =>
      calculateRoundScore({
        wordsSolved: -1,
        totalWords: 4,
        attemptsUsed: 1,
        maxAttempts: 9,
      }),
    ).toThrow();
  });
});

describe("calculateChampionshipScore", () => {
  it("soma as quatro modalidades", () => {
    const total = calculateChampionshipScore([
      { wordsSolved: 1, totalWords: 1, attemptsUsed: 3, maxAttempts: 6 },
      { wordsSolved: 2, totalWords: 2, attemptsUsed: 4, maxAttempts: 7 },
      { wordsSolved: 4, totalWords: 4, attemptsUsed: 6, maxAttempts: 9 },
      { wordsSolved: 5, totalWords: 6, attemptsUsed: 12, maxAttempts: 12 },
    ]);

    // 100+30, 200+30, 400+30, 500+0
    expect(total.baseScore).toBe(1200);
    expect(total.bonusScore).toBe(90);
    expect(total.totalScore).toBe(1290);
    expect(total.allWordsSolved).toBe(false);
  });

  it("atinge o maximo teorico quando resolve tudo na primeira tentativa", () => {
    const total = calculateChampionshipScore([
      { wordsSolved: 1, totalWords: 1, attemptsUsed: 1, maxAttempts: 6 },
      { wordsSolved: 2, totalWords: 2, attemptsUsed: 2, maxAttempts: 7 },
      { wordsSolved: 4, totalWords: 4, attemptsUsed: 4, maxAttempts: 9 },
      { wordsSolved: 6, totalWords: 6, attemptsUsed: 6, maxAttempts: 12 },
    ]);

    expect(total.baseScore).toBe(13 * CHAMPIONSHIP_SCORING.pointsPerWord);
    // (5 + 5 + 5 + 6) tentativas restantes x 10
    expect(total.bonusScore).toBe(210);
    expect(total.totalScore).toBe(1510);
  });
});
