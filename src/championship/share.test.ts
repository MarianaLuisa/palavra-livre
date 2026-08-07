import { describe, expect, it } from "vitest";
import { formatCountdown, formatDuration, formatPosition, formatScore } from "./format";
import { createChampionshipShareText } from "./share";

describe("createChampionshipShareText", () => {
  it("nao expoe resultado enquanto o campeonato esta em andamento", () => {
    const text = createChampionshipShareText({
      championshipDate: "2026-08-06",
      championshipFinished: false,
      position: 3,
      totalScore: 1220,
      wordsSolved: 12,
    });

    expect(text).not.toContain("1.220");
    expect(text).not.toContain("3º");
    expect(text).toContain("Resultados são divulgados no encerramento");
  });

  it("mostra o resumo completo depois do encerramento", () => {
    const text = createChampionshipShareText({
      championshipDate: "2026-08-06",
      championshipFinished: true,
      position: 3,
      totalScore: 1220,
      wordsSolved: 12,
    });

    expect(text).toContain("3º lugar");
    expect(text).toContain("1.220 pontos");
    expect(text).toContain("12 de 13 palavras");
  });

  it("funciona para quem nao tem colocacao", () => {
    const text = createChampionshipShareText({
      championshipDate: "2026-08-06",
      championshipFinished: true,
      position: null,
      totalScore: 300,
      wordsSolved: 3,
    });

    expect(text).toContain("Participei");
  });
});

describe("formatacao", () => {
  it("formata contagem regressiva", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5000)).toBe("00:00");
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(3_725_000)).toBe("01:02:05");
  });

  it("formata duracao", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(0)).toBe("-");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(125_000)).toBe("2min 05s");
    expect(formatDuration(3_900_000)).toBe("1h 05min");
  });

  it("formata pontuacao e posicao", () => {
    expect(formatScore(1220)).toBe("1.220");
    expect(formatScore(null)).toBe("-");
    expect(formatPosition(3)).toBe("3º");
    expect(formatPosition(null)).toBe("-");
  });
});
