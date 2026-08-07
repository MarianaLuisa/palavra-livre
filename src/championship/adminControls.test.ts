import { beforeEach, describe, expect, it } from "vitest";
import { getAdminActionAvailability } from "./adminActions";
import { LocalChampionshipEngine, LocalChampionshipService } from "./localEngine";
import type { ChampionshipMode, ChampionshipStatus } from "./types";

/**
 * Testes dos controles administrativos.
 *
 * O motor local espelha as regras de cd_admin_start_championship_now,
 * cd_admin_update_championship_schedule, cd_admin_cancel_championship e
 * companhia. Cobrem autorizacao, idempotencia, preservacao de dados e
 * bloqueios por status.
 */

const ADMIN_ID = "admin-user";
const PLAYER_ID = "player-user";

const ANSWERS: Record<ChampionshipMode, string[]> = {
  SIMPLE: ["coçar"],
  DUET: ["banho", "carro"],
  QUARTET: ["dados", "festa", "gelos", "hotel"],
  SEXTET: ["jovem", "lapis", "manga", "navio", "olhos", "praia"],
};

const ALL_ANSWERS = Object.values(ANSWERS).flat();

const EXTRA_WORDS = [
  "termo", "livre", "sonho", "vidro", "porta", "verde", "campo", "tarde",
  "pedra", "risco", "denso", "fungo", "queda", "bruto", "chave", "duplo",
  "grito", "junta", "mundo", "ponte",
];

const BASE_TIME = Date.parse("2026-08-06T15:00:00.000Z");
const REGISTRATION_OPENS = new Date(BASE_TIME - 60 * 60_000).toISOString();
const REGISTRATION_CLOSES = new Date(BASE_TIME + 5 * 60 * 60_000).toISOString();
const STARTS_AT = new Date(BASE_TIME + 6 * 60 * 60_000).toISOString();

type Harness = {
  engine: LocalChampionshipEngine;
  championshipId: string;
  admin: LocalChampionshipService;
  player: LocalChampionshipService;
  setTime: (value: number) => void;
  currentTime: () => number;
};

function createHarness(): Harness {
  let currentTime = BASE_TIME;

  const engine = new LocalChampionshipEngine({
    answerPool: [...ALL_ANSWERS, ...EXTRA_WORDS],
    validWords: [...ALL_ANSWERS, ...EXTRA_WORDS],
    now: () => currentTime,
    random: () => 0.42,
  });

  engine.addAdmin(ADMIN_ID);

  const championship = engine.createChampionship({
    championshipDate: "2026-08-06",
    registrationOpensAt: REGISTRATION_OPENS,
    registrationClosesAt: REGISTRATION_CLOSES,
    startsAt: STARTS_AT,
  });

  engine.setAnswers(championship.id, ANSWERS);

  return {
    engine,
    championshipId: championship.id,
    admin: new LocalChampionshipService(engine, ADMIN_ID),
    player: new LocalChampionshipService(engine, PLAYER_ID),
    setTime: (value) => {
      currentTime = value;
    },
    currentTime: () => currentTime,
  };
}

describe("Comecar agora - autorizacao", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("administrador consegue iniciar", async () => {
    const result = await harness.admin.startChampionshipNow(harness.championshipId);

    expect(result.status).toBe("IN_PROGRESS");
    expect(result.alreadyStarted).toBe(false);
  });

  it("usuario comum autenticado recebe erro de autorizacao", async () => {
    await expect(
      harness.player.startChampionshipNow(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("usuario comum tambem nao enxerga a visao administrativa", async () => {
    await expect(harness.player.getAdminOverview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("campeonato inexistente falha", async () => {
    await expect(
      harness.admin.startChampionshipNow("campeonato-que-nao-existe"),
    ).rejects.toMatchObject({ code: "CHAMPIONSHIP_NOT_FOUND" });
  });
});

describe("Comecar agora - efeitos", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.player.register("Rafael", harness.championshipId);
  });

  it("muda o status para IN_PROGRESS e o status permanece ao reler", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);

    // Releitura: o status e derivado do relogio, entao precisa persistir.
    const overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.status).toBe("IN_PROGRESS");

    const playerState = await harness.player.getState();
    expect(playerState.championship?.status).toBe("IN_PROGRESS");
  });

  it("encerra as inscricoes imediatamente", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);
    const overview = await harness.admin.getAdminOverview();
    const closesAt = Date.parse(overview.championship!.registrationClosesAt);

    expect(closesAt).toBeLessThanOrEqual(harness.currentTime());

    // Ninguem mais consegue se inscrever.
    const latecomer = new LocalChampionshipService(harness.engine, "outro-user");
    await expect(latecomer.register("Ana", harness.championshipId)).rejects.toMatchObject({
      code: "REGISTRATION_CLOSED",
    });
  });

  it("antecipa starts_at para o momento atual do servidor", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);
    const overview = await harness.admin.getAdminOverview();

    expect(Date.parse(overview.championship!.startsAt)).toBe(harness.currentTime());
  });

  it("mantem as mesmas 13 respostas", async () => {
    const before = await harness.admin.getAdminOverview();
    expect(before.championship?.answerCount).toBe(13);

    await harness.admin.startChampionshipNow(harness.championshipId);

    const after = await harness.admin.getAdminOverview();
    expect(after.championship?.answerCount).toBe(13);

    // Confere palavra por palavra depois do encerramento.
    await harness.admin.finishChampionship(harness.championshipId);
    const answers = await harness.admin.getChampionshipAnswers(harness.championshipId);
    expect(answers.flatMap((round) => round.answers)).toEqual(ALL_ANSWERS);
  });

  it("mantem os participantes ja inscritos", async () => {
    const before = await harness.admin.getAdminOverview();
    expect(before.counters.registered).toBe(1);

    await harness.admin.startChampionshipNow(harness.championshipId);

    const after = await harness.admin.getAdminOverview();
    expect(after.counters.registered).toBe(1);
    expect(after.participants[0].displayName).toBe("Rafael");
  });

  it("libera a primeira modalidade para quem estava inscrito", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);
    const state = await harness.player.getState();
    const simple = state.rounds.find((round) => round.mode === "SIMPLE");

    expect(simple?.unlocked).toBe(true);
    expect(state.currentRoundId).toBe(simple?.id);
  });

  it("nao recria rodadas", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);
    const overview = await harness.admin.getAdminOverview();

    expect(overview.rounds).toHaveLength(4);
    expect(overview.rounds.map((round) => round.mode)).toEqual([
      "SIMPLE",
      "DUET",
      "QUARTET",
      "SEXTET",
    ]);
  });
});

describe("Comecar agora - idempotencia e concorrencia", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.player.register("Rafael", harness.championshipId);
  });

  it("chamada dupla e idempotente", async () => {
    const first = await harness.admin.startChampionshipNow(harness.championshipId);
    const startedAt = first.startsAt;

    harness.setTime(harness.currentTime() + 30_000);
    const second = await harness.admin.startChampionshipNow(harness.championshipId);

    expect(first.alreadyStarted).toBe(false);
    expect(second.alreadyStarted).toBe(true);
    // O instante de inicio nao e reescrito na segunda chamada.
    expect(second.startsAt).toBe(startedAt);
  });

  it("dois cliques simultaneos produzem uma unica transicao", async () => {
    const results = await Promise.all([
      harness.admin.startChampionshipNow(harness.championshipId),
      harness.admin.startChampionshipNow(harness.championshipId),
    ]);

    const effective = results.filter((result) => !result.alreadyStarted);
    expect(effective).toHaveLength(1);

    const overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.status).toBe("IN_PROGRESS");
    expect(overview.counters.registered).toBe(1);
  });

  it("nao corrompe um campeonato ja em andamento com tentativas gravadas", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);

    const state = await harness.player.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await harness.player.startRound(simpleId);
    await harness.player.submitAttempt(simpleId, "termo");

    await harness.admin.startChampionshipNow(harness.championshipId);

    const afterState = await harness.player.getState();
    const simple = afterState.rounds.find((round) => round.mode === "SIMPLE");
    expect(simple?.attemptsUsed).toBe(1);
    expect(simple?.boards[0].rows).toHaveLength(1);
  });
});

describe("Comecar agora - bloqueios por status", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("campeonato cancelado nao inicia", async () => {
    await harness.admin.cancelChampionship(harness.championshipId);

    await expect(
      harness.admin.startChampionshipNow(harness.championshipId),
    ).rejects.toMatchObject({ code: "CHAMPIONSHIP_CANCELLED" });
  });

  it("campeonato finalizado nao inicia", async () => {
    harness.engine.finishChampionship(harness.championshipId);

    await expect(
      harness.admin.startChampionshipNow(harness.championshipId),
    ).rejects.toMatchObject({ code: "CHAMPIONSHIP_ALREADY_FINISHED" });
  });

  it("campeonato sem palavras sorteadas nao inicia", async () => {
    const engine = new LocalChampionshipEngine({
      answerPool: [...ALL_ANSWERS, ...EXTRA_WORDS],
      validWords: [...ALL_ANSWERS, ...EXTRA_WORDS],
      now: () => BASE_TIME,
    });
    engine.addAdmin(ADMIN_ID);
    const championship = engine.createChampionship({
      championshipDate: "2026-08-07",
      registrationOpensAt: REGISTRATION_OPENS,
      registrationClosesAt: REGISTRATION_CLOSES,
      startsAt: STARTS_AT,
    });
    engine.clearAnswers(championship.id);

    const admin = new LocalChampionshipService(engine, ADMIN_ID);
    await expect(admin.startChampionshipNow(championship.id)).rejects.toMatchObject({
      code: "CHAMPIONSHIP_WITHOUT_ANSWERS",
    });
  });
});

describe("Edicao de horarios", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("administrador consegue salvar horarios validos", async () => {
    await harness.admin.updateChampionshipSchedule(harness.championshipId, {
      registrationOpensAt: "2026-08-06T12:00:00.000Z",
      registrationClosesAt: "2026-08-06T22:55:00.000Z",
      startsAt: "2026-08-06T23:00:00.000Z",
    });

    const overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.startsAt).toBe("2026-08-06T23:00:00.000Z");
    expect(overview.championship?.registrationClosesAt).toBe("2026-08-06T22:55:00.000Z");
  });

  it("usuario comum nao consegue", async () => {
    await expect(
      harness.player.updateChampionshipSchedule(harness.championshipId, {
        registrationOpensAt: "2026-08-06T12:00:00.000Z",
        registrationClosesAt: "2026-08-06T22:55:00.000Z",
        startsAt: "2026-08-06T23:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("abertura depois do fechamento falha", async () => {
    await expect(
      harness.admin.updateChampionshipSchedule(harness.championshipId, {
        registrationOpensAt: "2026-08-06T23:00:00.000Z",
        registrationClosesAt: "2026-08-06T22:55:00.000Z",
        startsAt: "2026-08-06T23:30:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE_ORDER" });
  });

  it("fechamento depois do inicio falha", async () => {
    await expect(
      harness.admin.updateChampionshipSchedule(harness.championshipId, {
        registrationOpensAt: "2026-08-06T12:00:00.000Z",
        registrationClosesAt: "2026-08-06T23:30:00.000Z",
        startsAt: "2026-08-06T23:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE_ORDER" });
  });

  it("campeonato em andamento bloqueia alteracao de horario", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);

    await expect(
      harness.admin.updateChampionshipSchedule(harness.championshipId, {
        registrationOpensAt: "2026-08-06T12:00:00.000Z",
        registrationClosesAt: "2026-08-06T22:55:00.000Z",
        startsAt: "2026-08-06T23:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_UPDATE_NOT_ALLOWED" });
  });

  it("nao mexe em respostas nem em participantes", async () => {
    await harness.player.register("Rafael", harness.championshipId);

    await harness.admin.updateChampionshipSchedule(harness.championshipId, {
      registrationOpensAt: "2026-08-06T12:00:00.000Z",
      registrationClosesAt: "2026-08-06T22:55:00.000Z",
      startsAt: "2026-08-06T23:00:00.000Z",
    });

    const overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.answerCount).toBe(13);
    expect(overview.counters.registered).toBe(1);
  });
});

describe("Acoes rapidas", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("abrir inscricoes agora deixa o campeonato em REGISTRATION_OPEN", async () => {
    // Comeca com as inscricoes ainda fechadas.
    harness.setTime(Date.parse(REGISTRATION_OPENS) - 60_000);
    let overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.status).toBe("SCHEDULED");

    await harness.admin.openRegistrationNow(harness.championshipId);

    overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.status).toBe("REGISTRATION_OPEN");
  });

  it("fechar inscricoes agora leva para WAITING sem iniciar", async () => {
    await harness.admin.closeRegistrationNow(harness.championshipId);

    const overview = await harness.admin.getAdminOverview();
    expect(overview.championship?.status).toBe("WAITING");

    await expect(
      harness.player.register("Ana", harness.championshipId),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("iniciar em 5 minutos programa o inicio e mantem inscricoes abertas", async () => {
    await harness.admin.scheduleStartIn(harness.championshipId, 5);

    const overview = await harness.admin.getAdminOverview();
    expect(Date.parse(overview.championship!.startsAt)).toBe(harness.currentTime() + 5 * 60_000);
    expect(overview.championship?.status).toBe("REGISTRATION_OPEN");

    // Passado o tempo, o campeonato entra em andamento sozinho.
    harness.setTime(harness.currentTime() + 5 * 60_000);
    const later = await harness.admin.getAdminOverview();
    expect(later.championship?.status).toBe("IN_PROGRESS");
  });

  it("usuario comum nao usa os atalhos", async () => {
    await expect(
      harness.player.openRegistrationNow(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.player.scheduleStartIn(harness.championshipId, 5),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recusa quantidade de minutos invalida", async () => {
    await expect(
      harness.admin.scheduleStartIn(harness.championshipId, 0),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE_ORDER" });
  });
});

describe("Cancelamento", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.player.register("Rafael", harness.championshipId);
  });

  it("administrador consegue cancelar", async () => {
    await harness.admin.cancelChampionship(harness.championshipId);

    const overview = await harness.admin.getAdminOverview(harness.championshipId);
    expect(overview.championship?.status).toBe("CANCELLED");
  });

  it("depois de cancelar, o painel volta a oferecer a criacao do dia", async () => {
    await harness.admin.cancelChampionship(harness.championshipId);

    // Igual ao SQL: cd_today_championship_id ignora campeonatos cancelados,
    // entao a data fica livre para um novo campeonato oficial.
    const overview = await harness.admin.getAdminOverview();
    expect(overview.hasChampionshipToday).toBe(false);
    expect(overview.championship).toBeNull();
  });

  it("usuario comum nao consegue", async () => {
    await expect(
      harness.player.cancelChampionship(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nao apaga o campeonato nem os participantes", async () => {
    await harness.admin.cancelChampionship(harness.championshipId);

    const overview = await harness.admin.getAdminOverview(harness.championshipId);
    expect(overview.championship?.id).toBe(harness.championshipId);
    expect(overview.counters.registered).toBe(1);
    expect(overview.championship?.answerCount).toBe(13);
  });

  it("cancelar duas vezes nao gera erro", async () => {
    await harness.admin.cancelChampionship(harness.championshipId);
    await expect(
      harness.admin.cancelChampionship(harness.championshipId),
    ).resolves.toBeUndefined();
  });

  it("campeonato finalizado nao pode ser cancelado", async () => {
    harness.engine.finishChampionship(harness.championshipId);

    await expect(
      harness.admin.cancelChampionship(harness.championshipId),
    ).rejects.toMatchObject({ code: "CHAMPIONSHIP_ALREADY_FINISHED" });
  });
});

describe("Respostas protegidas", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("nao saem na visao geral antes do encerramento", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);
    const overview = await harness.admin.getAdminOverview();
    const serialized = JSON.stringify(overview);

    for (const answer of ALL_ANSWERS) {
      expect(serialized.includes(answer)).toBe(false);
    }
  });

  it("nao saem na visao geral nem depois do encerramento", async () => {
    harness.engine.finishChampionship(harness.championshipId);
    const overview = await harness.admin.getAdminOverview();
    const serialized = JSON.stringify(overview);

    for (const answer of ALL_ANSWERS) {
      expect(serialized.includes(answer)).toBe(false);
    }
  });

  it("a RPC dedicada recusa antes do encerramento", async () => {
    await harness.admin.startChampionshipNow(harness.championshipId);

    await expect(
      harness.admin.getChampionshipAnswers(harness.championshipId),
    ).rejects.toMatchObject({ code: "ANSWERS_NOT_AVAILABLE" });
  });

  it("a RPC dedicada entrega as respostas depois do encerramento", async () => {
    harness.engine.finishChampionship(harness.championshipId);
    const answers = await harness.admin.getChampionshipAnswers(harness.championshipId);

    expect(answers).toHaveLength(4);
    expect(answers.flatMap((round) => round.answers)).toHaveLength(13);
  });

  it("usuario comum nao acessa as respostas nem depois do encerramento", async () => {
    harness.engine.finishChampionship(harness.championshipId);

    await expect(
      harness.player.getChampionshipAnswers(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Visao geral do painel", () => {
  it("conta inscritos, jogando e finalizados", async () => {
    const harness = createHarness();
    const second = new LocalChampionshipService(harness.engine, "player-2");

    await harness.player.register("Rafael", harness.championshipId);
    await second.register("Ana", harness.championshipId);
    await harness.admin.startChampionshipNow(harness.championshipId);

    const state = await harness.player.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await harness.player.startRound(simpleId);

    const overview = await harness.admin.getAdminOverview();

    expect(overview.counters.registered).toBe(2);
    expect(overview.counters.started).toBe(1);
    expect(overview.counters.playing).toBe(1);
    expect(overview.counters.finished).toBe(0);

    const simpleRound = overview.rounds.find((round) => round.mode === "SIMPLE");
    expect(simpleRound?.inProgress).toBe(1);
    expect(simpleRound?.notStarted).toBe(1);

    const rafael = overview.participants.find((item) => item.displayName === "Rafael");
    expect(rafael?.currentRoundMode).toBe("SIMPLE");
  });

  it("informa se existe campeonato para hoje", async () => {
    const harness = createHarness();
    const overview = await harness.admin.getAdminOverview();

    expect(overview.today).toBe("2026-08-06");
    expect(overview.hasChampionshipToday).toBe(true);
    expect(overview.isToday).toBe(true);
    expect(overview.timezone).toBe("America/Sao_Paulo");
  });

  it("usa o horario do servidor, nao o do navegador", async () => {
    const harness = createHarness();
    const overview = await harness.admin.getAdminOverview();

    expect(Date.parse(overview.serverNow)).toBe(harness.currentTime());
  });
});

describe("Visibilidade dos botoes por estado", () => {
  const cases: Array<{
    status: ChampionshipStatus;
    startNow: boolean;
    editSchedule: boolean;
    cancel: boolean;
    finish: boolean;
    answers: boolean;
  }> = [
    { status: "SCHEDULED", startNow: true, editSchedule: true, cancel: true, finish: false, answers: false },
    { status: "REGISTRATION_OPEN", startNow: true, editSchedule: true, cancel: true, finish: false, answers: false },
    { status: "WAITING", startNow: true, editSchedule: true, cancel: true, finish: false, answers: false },
    { status: "IN_PROGRESS", startNow: false, editSchedule: false, cancel: true, finish: true, answers: false },
    { status: "CALCULATING_RESULTS", startNow: false, editSchedule: false, cancel: true, finish: true, answers: false },
    { status: "FINISHED", startNow: false, editSchedule: false, cancel: false, finish: false, answers: true },
    { status: "CANCELLED", startNow: false, editSchedule: false, cancel: false, finish: false, answers: false },
  ];

  for (const expected of cases) {
    it(`define os botoes corretos em ${expected.status}`, () => {
      const availability = getAdminActionAvailability(expected.status);

      expect(availability.canStartNow).toBe(expected.startNow);
      expect(availability.canEditSchedule).toBe(expected.editSchedule);
      expect(availability.canCancel).toBe(expected.cancel);
      expect(availability.canFinish).toBe(expected.finish);
      expect(availability.canViewAnswers).toBe(expected.answers);
    });
  }

  it("sem campeonato nenhuma acao fica disponivel", () => {
    const availability = getAdminActionAvailability(null);

    expect(Object.values(availability).every((value) => value === false)).toBe(true);
  });
});

describe("Aba de jogadores no painel", () => {
  it("administrador lista as contas", async () => {
    const harness = createHarness();
    harness.engine.setPlayerSource({
      listPlayers: () => [
        {
          userId: "user-1",
          username: "mariana",
          displayName: "mariana",
          createdAt: "2026-08-01T12:00:00.000Z",
          isPermanent: true,
          isAdmin: true,
          dailyGoal: 3,
          games: 12,
          completedGames: 9,
          completionRate: 75,
          wordsSolved: 20,
          attempts: 40,
          durationMs: 600_000,
          activeDays: 5,
          lastPlayedDate: "2026-08-06",
          championshipsPlayed: 2,
          championshipWins: 1,
          championshipPodiums: 2,
          championshipBestPosition: 1,
          championshipBestScore: 1200,
          lastChampionshipDate: "2026-08-06",
        },
      ],
      getPlayerGames: (userId) => ({
        userId,
        username: "mariana",
        displayName: "mariana",
        entries: [],
      }),
    });

    const players = await harness.admin.listPlayers();

    expect(players).toHaveLength(1);
    expect(players[0].username).toBe("mariana");
    // A listagem nunca carrega e-mail.
    expect(JSON.stringify(players).includes("@")).toBe(false);
  });

  it("usuario comum nao lista contas nem abre historico de terceiros", async () => {
    const harness = createHarness();

    await expect(harness.player.listPlayers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(harness.player.getPlayerGames("user-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Criar o proximo campeonato", () => {
  it("cria para amanha quando hoje ja tem campeonato encerrado", async () => {
    const harness = createHarness();
    // O harness ja criou o campeonato de 2026-08-06 (hoje). Encerra ele.
    harness.engine.finishChampionship(harness.championshipId);

    const result = await harness.admin.createNextChampionship();

    // Campeonato encerrado continua ocupando a data: vai para o dia seguinte.
    expect(result.isToday).toBe(false);
    expect(result.championshipDate).toBe("2026-08-07");
    expect(result.daysAhead).toBe(1);
  });

  it("cria para hoje quando a data esta livre", async () => {
    const harness = createHarness();
    // Cancelar libera a data.
    await harness.admin.cancelChampionship(harness.championshipId);

    const result = await harness.admin.createNextChampionship();

    expect(result.isToday).toBe(true);
    expect(result.championshipDate).toBe("2026-08-06");
  });

  it("pula os dias ja ocupados em sequencia", async () => {
    const harness = createHarness();
    await harness.admin.createChampionship({ championshipDate: "2026-08-07" });
    await harness.admin.createChampionship({ championshipDate: "2026-08-08" });

    const result = await harness.admin.createNextChampionship();

    expect(result.championshipDate).toBe("2026-08-09");
    expect(result.daysAhead).toBe(3);
  });

  it("criar com data ja ocupada devolve erro tratavel, nao SQL cru", async () => {
    const harness = createHarness();

    await expect(
      harness.admin.createChampionship({ championshipDate: "2026-08-06" }),
    ).rejects.toMatchObject({ code: "CHAMPIONSHIP_DATE_TAKEN" });
  });

  it("usuario comum nao cria o proximo campeonato", async () => {
    const harness = createHarness();

    await expect(harness.player.createNextChampionship()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Criacao do campeonato pela tela do campeonato", () => {
  it("administrador cria o campeonato do dia", async () => {
    const harness = createHarness();
    // Libera a data de amanha para nao colidir com o campeonato do harness.
    const result = await harness.admin.createChampionship({
      championshipDate: "2026-08-07",
      registrationOpensAt: "2026-08-07T12:00:00.000Z",
      registrationClosesAt: "2026-08-07T22:00:00.000Z",
      startsAt: "2026-08-07T23:00:00.000Z",
    });

    expect(typeof result.championshipId).toBe("string");
  });

  it("usuario comum nao cria campeonato nem por chamada direta", async () => {
    const harness = createHarness();

    // O botao some da interface, mas o que protege de verdade e isto:
    // a RPC recusa quem nao esta em championship_admins.
    await expect(
      harness.player.createChampionship({
        championshipDate: "2026-08-07",
        registrationOpensAt: "2026-08-07T12:00:00.000Z",
        registrationClosesAt: "2026-08-07T22:00:00.000Z",
        startsAt: "2026-08-07T23:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("usuario comum nao muda status nem sorteia palavras", async () => {
    const harness = createHarness();

    await expect(
      harness.player.setChampionshipStatus(harness.championshipId, "IN_PROGRESS"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.player.redrawWords(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.player.finishChampionship(harness.championshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
