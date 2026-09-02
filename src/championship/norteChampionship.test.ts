import { describe, expect, it } from "vitest";
import { LocalChampionshipEngine } from "./localEngine";
import {
  formatNorteWeekRange,
  formatNorteWeekTitle,
  getBrazilWeekEnd,
  getBrazilWeekStart,
} from "./weeklyChampionshipDomain";

describe("Campeonato Norte - Regras de Domínio e Idempotência", () => {
  it("o nome é estritamente 'Campeonato Norte' e cada semana é identificada pelo intervalo de datas", () => {
    const monday = "2026-08-31";
    const start = getBrazilWeekStart(monday);
    const end = getBrazilWeekEnd(start);

    expect(start).toBe("2026-08-31");
    expect(end).toBe("2026-09-04"); // Sexta-feira

    const rangeLabel = formatNorteWeekRange(start, end);
    const weekTitle = formatNorteWeekTitle(start, end);

    expect(rangeLabel).toBe("31/08/2026 – 04/09/2026");
    expect(weekTitle).toBe("Campeonato Norte — 31/08/2026 a 04/09/2026");

    // Próxima semana
    const nextMonday = "2026-09-07";
    const nextStart = getBrazilWeekStart(nextMonday);
    const nextEnd = getBrazilWeekEnd(nextStart);

    expect(nextStart).toBe("2026-09-07");
    expect(nextEnd).toBe("2026-09-11");
    expect(formatNorteWeekRange(nextStart, nextEnd)).toBe("07/09/2026 – 11/09/2026");
    expect(formatNorteWeekTitle(nextStart, nextEnd)).toBe("Campeonato Norte — 07/09/2026 a 11/09/2026");
  });

  it("criação automática de rodadas diárias de Segunda a Sexta é idempotente", () => {
    // 2026-09-01 é Terça-feira
    const engine = new LocalChampionshipEngine(Date.parse("2026-09-01T14:00:00-03:00"));

    const id1 = engine.ensureCurrentNorteRound("2026-09-01");
    expect(id1).toBeTruthy();

    const id2 = engine.ensureCurrentNorteRound("2026-09-01");
    expect(id2).toBe(id1);

    const currentId = engine.getCurrentChampionshipId();
    expect(currentId).toBe(id1);

    const state = engine.buildState(id1, null);
    expect(state.championship?.name).toBe("Campeonato Norte");
    expect(state.championship?.championshipDate).toBe("2026-09-01");
  });

  it("não cria rodadas diárias em sábados e domingos (fim de semana)", () => {
    // 2026-09-05 é Sábado, 2026-09-06 é Domingo
    const engine = new LocalChampionshipEngine(Date.parse("2026-09-05T14:00:00-03:00"));

    const saturdayRound = engine.ensureCurrentNorteRound("2026-09-05");
    expect(saturdayRound).toBeNull();

    const sundayRound = engine.ensureCurrentNorteRound("2026-09-06");
    expect(sundayRound).toBeNull();
  });

  it("permite a criação e coexistência de campeonatos normais pelo administrador", () => {
    const engine = new LocalChampionshipEngine(Date.parse("2026-09-01T10:00:00-03:00"));

    // Campeonato Norte automático do dia
    const norteId = engine.ensureCurrentNorteRound("2026-09-01");

    // Campeonato normal criado para outra data ou pelo admin
    const custom = engine.createChampionship({
      name: "Torneio Especial dos Campeões",
      championshipDate: "2026-09-15",
    });

    expect(custom.id).toBeTruthy();
    expect(custom.name).toBe("Torneio Especial dos Campeões");
    expect(custom.id).not.toBe(norteId);
  });

  it("garante a rodada de hoje (Quarta 02/09) mesmo quando 31/08 e 01/09 já existem no banco", () => {
    // Começa na Terça 01/09
    const engine = new LocalChampionshipEngine(Date.parse("2026-09-01T10:00:00-03:00"));
    const mondayId = engine.ensureCurrentNorteRound("2026-08-31");
    const tuesdayId = engine.ensureCurrentNorteRound("2026-09-01");
    expect(mondayId).toBeTruthy();
    expect(tuesdayId).toBeTruthy();

    // Avança o relógio para Quarta-feira 02/09
    engine.setTime(Date.parse("2026-09-02T11:41:43-03:00"));

    // O carregamento inicial resolve a rodada de hoje (02/09)
    const currentId = engine.getCurrentChampionshipId();
    expect(currentId).toBeTruthy();
    expect(currentId).not.toBe(mondayId);
    expect(currentId).not.toBe(tuesdayId);

    const state = engine.buildState(currentId, null);
    expect(state.championship?.championshipDate).toBe("2026-09-02");
    expect(state.championship?.name).toBe("Campeonato Norte");
  });
});
