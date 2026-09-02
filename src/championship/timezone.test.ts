import { describe, expect, it } from "vitest";
import {
  addMinutesToIso,
  fromZonedDateTime,
  getBrazilCurrentDate,
  getZonedToday,
  toZonedDateTime,
} from "./timezone";

const SAO_PAULO = "America/Sao_Paulo";

/**
 * O painel administrativo mostra e recebe horario de Brasilia, mas o banco
 * guarda timestamptz. Estes testes travam a conversao nos dois sentidos.
 */
describe("fromZonedDateTime", () => {
  it("converte horario de Brasilia para UTC", () => {
    // 20:00 em Sao Paulo (UTC-3) = 23:00 UTC.
    expect(fromZonedDateTime("2026-08-06", "20:00", SAO_PAULO)).toBe(
      "2026-08-06T23:00:00.000Z",
    );
  });

  it("converte os horarios padrao do projeto", () => {
    expect(fromZonedDateTime("2026-08-06", "09:00", SAO_PAULO)).toBe(
      "2026-08-06T12:00:00.000Z",
    );
    expect(fromZonedDateTime("2026-08-06", "19:55", SAO_PAULO)).toBe(
      "2026-08-06T22:55:00.000Z",
    );
  });

  it("atravessa a virada do dia corretamente", () => {
    // 22:00 em Sao Paulo vira 01:00 UTC do dia seguinte.
    expect(fromZonedDateTime("2026-08-06", "22:00", SAO_PAULO)).toBe(
      "2026-08-07T01:00:00.000Z",
    );
  });

  it("trata meia-noite", () => {
    expect(fromZonedDateTime("2026-08-06", "00:00", SAO_PAULO)).toBe(
      "2026-08-06T03:00:00.000Z",
    );
  });

  it("funciona em UTC", () => {
    expect(fromZonedDateTime("2026-08-06", "20:00", "UTC")).toBe(
      "2026-08-06T20:00:00.000Z",
    );
  });

  it("recusa entradas invalidas", () => {
    expect(() => fromZonedDateTime("06/08/2026", "20:00", SAO_PAULO)).toThrow();
    expect(() => fromZonedDateTime("2026-08-06", "8:00", SAO_PAULO)).toThrow();
    expect(() => fromZonedDateTime("2026-08-06", "25:00", SAO_PAULO)).toThrow();
  });
});

describe("toZonedDateTime", () => {
  it("converte UTC para horario de Brasilia", () => {
    expect(toZonedDateTime("2026-08-06T23:00:00.000Z", SAO_PAULO)).toEqual({
      date: "2026-08-06",
      time: "20:00",
    });
  });

  it("recua o dia quando o instante UTC ja virou", () => {
    // 01:00 UTC do dia 7 e 22:00 do dia 6 em Sao Paulo.
    expect(toZonedDateTime("2026-08-07T01:00:00.000Z", SAO_PAULO)).toEqual({
      date: "2026-08-06",
      time: "22:00",
    });
  });

  it("devolve null para valores ausentes ou invalidos", () => {
    expect(toZonedDateTime(null, SAO_PAULO)).toBeNull();
    expect(toZonedDateTime(undefined, SAO_PAULO)).toBeNull();
    expect(toZonedDateTime("nao e uma data", SAO_PAULO)).toBeNull();
  });
});

describe("ida e volta", () => {
  it("preserva o horario de parede nas duas conversoes", () => {
    const times = ["00:00", "06:30", "09:00", "12:00", "19:55", "20:00", "23:59"];

    for (const time of times) {
      const instant = fromZonedDateTime("2026-08-06", time, SAO_PAULO);
      expect(toZonedDateTime(instant, SAO_PAULO)).toEqual({
        date: "2026-08-06",
        time,
      });
    }
  });

  it("corresponde aos horarios do campeonato ja existente no banco", () => {
    // Valores reais gravados: 12:00Z, 22:55Z e 23:00Z.
    expect(toZonedDateTime("2026-08-06T12:00:00+00:00", SAO_PAULO)?.time).toBe("09:00");
    expect(toZonedDateTime("2026-08-06T22:55:00+00:00", SAO_PAULO)?.time).toBe("19:55");
    expect(toZonedDateTime("2026-08-06T23:00:00+00:00", SAO_PAULO)?.time).toBe("20:00");
  });
});

describe("getZonedToday", () => {
  it("usa o horario do servidor para descobrir a data local", () => {
    // 02:00 UTC do dia 7 ainda e dia 6 em Sao Paulo.
    expect(getZonedToday("2026-08-07T02:00:00.000Z", SAO_PAULO)).toBe("2026-08-06");
    expect(getZonedToday("2026-08-07T04:00:00.000Z", SAO_PAULO)).toBe("2026-08-07");
  });
});

describe("getBrazilCurrentDate", () => {
  it("determina a data corrente no fuso de Brasília", () => {
    expect(getBrazilCurrentDate("2026-09-02T02:00:00.000Z")).toBe("2026-09-01"); // 23h do dia 01/09 em SP
    expect(getBrazilCurrentDate("2026-09-02T04:00:00.000Z")).toBe("2026-09-02"); // 01h do dia 02/09 em SP
    expect(getBrazilCurrentDate("2026-09-02T14:41:43.000Z")).toBe("2026-09-02");
  });
});

describe("addMinutesToIso", () => {
  it("soma minutos preservando o formato", () => {
    expect(addMinutesToIso("2026-08-06T23:00:00.000Z", 5)).toBe("2026-08-06T23:05:00.000Z");
  });
});
