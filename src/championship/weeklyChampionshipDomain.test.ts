import { describe, expect, it } from "vitest";
import { formatDateWithWeekday } from "./format";
import {
  getBrazilWeekEnd,
  getBrazilWeekStart,
  getBrazilWeekday,
  getRoundLabelForDate,
  isCompetitionDay,
} from "./weeklyChampionshipDomain";

describe("weeklyChampionshipDomain", () => {
  it("define a semana de segunda a sexta para o exemplo pedido", () => {
    expect(getBrazilWeekStart("2026-08-31")).toBe("2026-08-31");
    expect(getBrazilWeekEnd("2026-08-31")).toBe("2026-09-04");

    expect(getBrazilWeekStart("2026-09-01")).toBe("2026-08-31");
    expect(getBrazilWeekStart("2026-09-04")).toBe("2026-08-31");
    expect(getBrazilWeekStart("2026-09-05")).toBe("2026-08-31");
    expect(getBrazilWeekStart("2026-09-06")).toBe("2026-08-31");
    expect(getBrazilWeekStart("2026-09-07")).toBe("2026-09-07");
  });

  it("reconhece a semana de trabalho e desconsidera fim de semana", () => {
    expect(getBrazilWeekday("2026-08-31")).toBe(1);
    expect(getBrazilWeekday("2026-09-01")).toBe(2);
    expect(getBrazilWeekday("2026-09-02")).toBe(3);
    expect(getBrazilWeekday("2026-09-03")).toBe(4);
    expect(getBrazilWeekday("2026-09-04")).toBe(5);
    expect(getBrazilWeekday("2026-09-05")).toBeNull();
    expect(getBrazilWeekday("2026-09-06")).toBeNull();

    expect(isCompetitionDay("2026-09-04")).toBe(true);
    expect(isCompetitionDay("2026-09-05")).toBe(false);
    expect(isCompetitionDay("2026-09-06")).toBe(false);
  });

  it("mapeia a rodada diária correta para cada dia útil", () => {
    expect(getRoundLabelForDate("2026-08-31")).toBe("SEGUNDA");
    expect(getRoundLabelForDate("2026-09-01")).toBe("TERCA");
    expect(getRoundLabelForDate("2026-09-02")).toBe("QUARTA");
    expect(getRoundLabelForDate("2026-09-03")).toBe("QUINTA");
    expect(getRoundLabelForDate("2026-09-04")).toBe("SEXTA");
    expect(getRoundLabelForDate("2026-09-05")).toBeNull();
  });

  it("cria um novo campeonato na segunda seguinte", () => {
    const current = getBrazilWeekStart("2026-09-07");
    const previous = getBrazilWeekStart("2026-09-04");

    expect(current).toBe("2026-09-07");
    expect(previous).toBe("2026-08-31");
    expect(current).not.toBe(previous);
  });

  it("formata a data com o dia da semana por extenso para a interface", () => {
    expect(formatDateWithWeekday("2026-09-02")).toBe("Quarta-feira (02/09/2026)");
    expect(formatDateWithWeekday("2026-08-31")).toBe("Segunda-feira (31/08/2026)");
  });
});
