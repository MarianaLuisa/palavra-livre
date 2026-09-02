import { beforeEach, describe, expect, it } from "vitest";
import { ChampionshipError } from "./errors";
import { LocalChampionshipEngine, LocalChampionshipService } from "./localEngine";
import type { ChampionshipMode, ChampionshipState } from "./types";

/**
 * Testes de integracao da modalidade competitiva.
 *
 * O motor local reproduz as mesmas regras das funcoes SQL, entao estes
 * testes cobrem inscricao, ordem das rodadas, validacao de tentativas,
 * pontuacao, restauracao de estado, ocultacao de respostas, encerramento,
 * classificacao e cenarios de duplicacao/concorrencia.
 */

const ANSWERS: Record<ChampionshipMode, string[]> = {
  SIMPLE: ["coçar"],
  DUET: ["banho", "carro"],
  QUARTET: ["dados", "festa", "gelos", "hotel"],
  SEXTET: ["jovem", "lapis", "manga", "navio", "olhos", "praia"],
};

const ALL_ANSWERS = Object.values(ANSWERS).flat();

const EXTRA_WORDS = [
  "termo",
  "livre",
  "sonho",
  "vidro",
  "porta",
  "verde",
  "campo",
  "tarde",
  "pedra",
  "risco",
  "denso",
  "fungo",
  "queda",
  "bruto",
  "chave",
  "duplo",
  "grito",
  "junta",
  "mundo",
  "ponte",
];

const BASE_TIME = Date.parse("2026-08-06T22:00:00.000Z");
const REGISTRATION_OPENS = new Date(BASE_TIME - 60 * 60_000).toISOString();
const REGISTRATION_CLOSES = new Date(BASE_TIME + 5 * 60_000).toISOString();
const STARTS_AT = new Date(BASE_TIME + 10 * 60_000).toISOString();

type Harness = {
  engine: LocalChampionshipEngine;
  championshipId: string;
  setTime: (value: number) => void;
  advance: (ms: number) => void;
  serviceFor: (userId: string) => LocalChampionshipService;
};

function createHarness(): Harness {
  let currentTime = BASE_TIME;

  const engine = new LocalChampionshipEngine({
    answerPool: [...ALL_ANSWERS, ...EXTRA_WORDS],
    validWords: [...ALL_ANSWERS, ...EXTRA_WORDS],
    now: () => currentTime,
    random: () => 0.42,
  });

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
    setTime: (value) => {
      currentTime = value;
    },
    advance: (ms) => {
      currentTime += ms;
    },
    serviceFor: (userId) => new LocalChampionshipService(engine, userId),
  };
}

function roundByMode(state: ChampionshipState, mode: ChampionshipMode) {
  const round = state.rounds.find((item) => item.mode === mode);

  if (round === undefined) {
    throw new Error(`Rodada ${mode} nao encontrada.`);
  }

  return round;
}

async function playRound(
  service: LocalChampionshipService,
  mode: ChampionshipMode,
): Promise<ChampionshipState> {
  let state = await service.getState();
  const round = roundByMode(state, mode);
  state = await service.startRound(round.id);

  for (const word of ANSWERS[mode]) {
    state = await service.submitAttempt(round.id, word);
  }

  return state;
}

describe("Campeonato Norte - modelo semanal", () => {
  it("cria campeonatos com o nome Norte e a classificacao semanal usa esse nome", async () => {
    const engine = new LocalChampionshipEngine({
      answerPool: [...ALL_ANSWERS, ...EXTRA_WORDS],
      validWords: [...ALL_ANSWERS, ...EXTRA_WORDS],
      now: () => BASE_TIME,
      random: () => 0.42,
    });

    const created = engine.createChampionship({
      championshipDate: "2026-08-06",
      registrationOpensAt: REGISTRATION_OPENS,
      registrationClosesAt: REGISTRATION_CLOSES,
      startsAt: STARTS_AT,
    });

    expect(created.name).toBe("Campeonato Norte");
    expect(engine.getWeeklyLeaderboard("2026-08-03").championshipName).toBe("Campeonato Norte");
  });
});

describe("Campeonato Diario - inscricao", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("cria exatamente 13 palavras distribuidas nas quatro modalidades", async () => {
    const state = await harness.serviceFor("user-a").getState();
    const totalBoards = state.rounds.reduce((total, round) => total + round.boardCount, 0);

    expect(state.rounds.map((round) => round.mode)).toEqual([
      "SIMPLE",
      "DUET",
      "QUARTET",
      "SEXTET",
    ]);
    expect(state.rounds.map((round) => round.boardCount)).toEqual([1, 2, 4, 6]);
    expect(state.rounds.map((round) => round.maxAttempts)).toEqual([6, 7, 9, 11]);
    expect(totalBoards).toBe(13);
  });

  it("permite inscricao enquanto as inscricoes estao abertas", async () => {
    const state = await harness.serviceFor("user-a").register("Mariana");

    expect(state.championship?.status).toBe("REGISTRATION_OPEN");
    expect(state.participant?.displayName).toBe("Mariana");
    expect(state.participant?.status).toBe("REGISTERED");
    expect(state.championship?.participantCount).toBe(1);
  });

  it("nao permite o mesmo usuario se inscrever duas vezes", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    const state = await service.register("Mariana");

    expect(state.championship?.participantCount).toBe(1);
  });

  it("nao permite dois participantes com o mesmo nome", async () => {
    await harness.serviceFor("user-a").register("Mariana");

    await expect(harness.serviceFor("user-b").register("mariana")).rejects.toMatchObject({
      code: "DISPLAY_NAME_TAKEN",
    });
  });

  it("recusa nomes fora do tamanho permitido", async () => {
    await expect(harness.serviceFor("user-a").register("x")).rejects.toMatchObject({
      code: "INVALID_DISPLAY_NAME",
    });
  });

  it("fecha as inscricoes no horario definido", async () => {
    harness.setTime(Date.parse(REGISTRATION_CLOSES) + 1000);

    await expect(harness.serviceFor("user-a").register("Mariana")).rejects.toMatchObject({
      code: "REGISTRATION_CLOSED",
    });
  });

  it("permite cancelar a propria inscricao antes do inicio", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    const state = await service.cancelRegistration();

    expect(state.participant).toBeNull();
    expect(state.championship?.participantCount).toBe(0);
  });

  it("nao permite cancelar depois do inicio", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT) + 1000);

    await expect(service.cancelRegistration()).rejects.toMatchObject({
      code: "CANCELLATION_NOT_ALLOWED",
    });
  });
});

describe("Campeonato Diario - ordem das modalidades", () => {
  let harness: Harness;
  let service: LocalChampionshipService;

  beforeEach(async () => {
    harness = createHarness();
    service = harness.serviceFor("user-a");
    await service.register("Mariana");
  });

  it("bloqueia rodadas antes do inicio oficial", async () => {
    const state = await service.getState();

    await expect(service.startRound(roundByMode(state, "SIMPLE").id)).rejects.toMatchObject({
      code: "CHAMPIONSHIP_NOT_IN_PROGRESS",
    });
  });

  it("libera a primeira modalidade quando o servidor confirma o inicio", async () => {
    harness.setTime(Date.parse(STARTS_AT));
    const state = await service.getState();

    expect(state.championship?.status).toBe("IN_PROGRESS");
    expect(state.currentRoundId).toBe(roundByMode(state, "SIMPLE").id);
    expect(roundByMode(state, "SIMPLE").unlocked).toBe(true);
  });

  it("nao deixa pular direto para outra modalidade", async () => {
    harness.setTime(Date.parse(STARTS_AT));
    const state = await service.getState();

    await expect(service.startRound(roundByMode(state, "QUARTET").id)).rejects.toMatchObject({
      code: "PREVIOUS_ROUND_PENDING",
    });
  });

  it("libera a proxima modalidade somente depois de fechar a anterior", async () => {
    harness.setTime(Date.parse(STARTS_AT));
    const afterSimple = await playRound(service, "SIMPLE");

    expect(roundByMode(afterSimple, "SIMPLE").status).toBe("COMPLETED");
    expect(afterSimple.currentRoundId).toBe(roundByMode(afterSimple, "DUET").id);

    const duet = roundByMode(afterSimple, "DUET");
    await expect(service.startRound(duet.id)).resolves.toBeTruthy();
  });

  it("fecha a modalidade quando as tentativas acabam, mesmo sem acertar", async () => {
    harness.setTime(Date.parse(STARTS_AT));
    const state = await service.getState();
    const simple = roundByMode(state, "SIMPLE");
    await service.startRound(simple.id);

    let latest = state;
    for (const word of EXTRA_WORDS.slice(0, 6)) {
      latest = await service.submitAttempt(simple.id, word);
    }

    const finished = roundByMode(latest, "SIMPLE");
    expect(finished.status).toBe("FAILED");
    expect(finished.attemptsUsed).toBe(6);
    expect(finished.wordsSolved).toBe(0);
    expect(finished.totalScore).toBe(0);
    expect(latest.currentRoundId).toBe(roundByMode(latest, "DUET").id);
  });
});

describe("Campeonato Diario - tentativas", () => {
  let harness: Harness;
  let service: LocalChampionshipService;
  let simpleRoundId: string;

  beforeEach(async () => {
    harness = createHarness();
    service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));
    const state = await service.getState();
    simpleRoundId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleRoundId);
  });

  it("recusa palavras fora da base aceita", async () => {
    await expect(service.submitAttempt(simpleRoundId, "zzzzz")).rejects.toMatchObject({
      code: "WORD_NOT_ACCEPTED",
    });
  });

  it("recusa palavras com tamanho diferente de cinco letras", async () => {
    await expect(service.submitAttempt(simpleRoundId, "casa")).rejects.toMatchObject({
      code: "INVALID_WORD_LENGTH",
    });
  });

  it("recusa a mesma palavra duas vezes na mesma modalidade", async () => {
    await service.submitAttempt(simpleRoundId, "termo");

    await expect(service.submitAttempt(simpleRoundId, "termo")).rejects.toMatchObject({
      code: "DUPLICATE_ATTEMPT",
    });
  });

  it("nao aceita tentativa em rodada ja encerrada", async () => {
    await service.submitAttempt(simpleRoundId, "coçar");

    await expect(service.submitAttempt(simpleRoundId, "termo")).rejects.toMatchObject({
      code: "ROUND_ALREADY_FINISHED",
    });
  });

  it("exige iniciar a rodada antes de enviar tentativa", async () => {
    const state = await service.getState();
    const duet = roundByMode(state, "DUET");

    await expect(service.submitAttempt(duet.id, "termo")).rejects.toMatchObject({
      code: "ROUND_NOT_STARTED",
    });
  });

  it("ignora acentos e cedilha na comparacao e revela a grafia oficial", async () => {
    const state = await service.submitAttempt(simpleRoundId, "cocar");
    const board = roundByMode(state, "SIMPLE").boards[0];

    expect(board.solved).toBe(true);
    expect(board.answer).toBe("coçar");
    expect(board.rows[0].map((letter) => letter.status)).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("nao envia respostas para o cliente antes da resolucao", async () => {
    const state = await service.submitAttempt(simpleRoundId, "termo");
    const round = roundByMode(state, "SIMPLE");

    expect(round.boards[0].solved).toBe(false);
    expect(round.boards[0].answer).toBeNull();
    expect(round.boards[0].rows).toHaveLength(1);
  });

  it("nao expoe respostas das modalidades futuras", async () => {
    const state = await service.getState();

    for (const round of state.rounds.filter((item) => item.mode !== "SIMPLE")) {
      for (const board of round.boards) {
        expect(board.answer).toBeNull();
      }
    }
  });

  it("revela todas as respostas quando a modalidade termina sem acerto", async () => {
    let latest = await service.getState();
    for (const word of EXTRA_WORDS.slice(0, 6)) {
      latest = await service.submitAttempt(simpleRoundId, word);
    }

    expect(roundByMode(latest, "SIMPLE").boards[0].answer).toBe("coçar");
  });

  it("para de avaliar tabuleiros ja resolvidos", async () => {
    const state = await service.getState();
    const duetId = roundByMode(state, "DUET").id;

    // Fecha o Simples para liberar o Dueto.
    await service.submitAttempt(simpleRoundId, "coçar");
    await service.startRound(duetId);

    const afterFirst = await service.submitAttempt(duetId, "banho");
    const duetAfterFirst = roundByMode(afterFirst, "DUET");
    expect(duetAfterFirst.boards[0].solved).toBe(true);
    expect(duetAfterFirst.boards[0].rows).toHaveLength(1);

    const afterSecond = await service.submitAttempt(duetId, "carro");
    const duetAfterSecond = roundByMode(afterSecond, "DUET");
    // O tabuleiro resolvido nao recebe nova linha.
    expect(duetAfterSecond.boards[0].rows).toHaveLength(1);
    expect(duetAfterSecond.boards[1].rows).toHaveLength(2);
    expect(duetAfterSecond.status).toBe("COMPLETED");
  });
});

describe("Campeonato Diario - pontuacao e restauracao", () => {
  let harness: Harness;
  let service: LocalChampionshipService;

  beforeEach(async () => {
    harness = createHarness();
    service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));
  });

  it("pontua a modalidade com base e bonus calculados no servidor", async () => {
    const state = await playRound(service, "SIMPLE");
    const simple = roundByMode(state, "SIMPLE");

    expect(simple.wordsSolved).toBe(1);
    expect(simple.attemptsUsed).toBe(1);
    expect(simple.baseScore).toBe(100);
    // 6 tentativas - 1 usada = 5 restantes x 10
    expect(simple.bonusScore).toBe(50);
    expect(simple.totalScore).toBe(150);
  });

  it("acumula a pontuacao das quatro modalidades", async () => {
    await playRound(service, "SIMPLE");
    await playRound(service, "DUET");
    await playRound(service, "QUARTET");
    const state = await playRound(service, "SEXTET");

    expect(state.participant?.wordsSolved).toBe(13);
    expect(state.participant?.completedRounds).toBe(4);
    expect(state.participant?.totalAttempts).toBe(13);
    // 150 + 250 + 450 + 650
    expect(state.participant?.totalScore).toBe(1500);
  });

  it("restaura o estado ao recarregar ou trocar de dispositivo", async () => {
    const state = await service.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleId);
    await service.submitAttempt(simpleId, "termo");

    // Outra sessao do mesmo usuario, como se fosse outro navegador.
    const otherDevice = harness.serviceFor("user-a");
    const restored = await otherDevice.getState();
    const simple = roundByMode(restored, "SIMPLE");

    expect(restored.currentRoundId).toBe(simpleId);
    expect(simple.status).toBe("IN_PROGRESS");
    expect(simple.attemptsUsed).toBe(1);
    expect(simple.boards[0].rows).toHaveLength(1);
    expect(simple.boards[0].answer).toBeNull();
  });

  it("nao permite reiniciar uma rodada para apagar tentativas", async () => {
    const state = await service.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleId);
    await service.submitAttempt(simpleId, "termo");

    const afterRestart = await service.startRound(simpleId);
    const simple = roundByMode(afterRestart, "SIMPLE");

    expect(simple.attemptsUsed).toBe(1);
    expect(simple.boards[0].rows).toHaveLength(1);
  });

  it("mantem a participacao quando o jogador abandona", async () => {
    await playRound(service, "SIMPLE");
    const state = await service.abandon();

    expect(state.participant?.status).toBe("ABANDONED");
    expect(state.participant?.totalScore).toBe(150);
  });
});

describe("Campeonato Diario - classificacao e encerramento", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("mantem a classificacao parcial sem revelar pontuacao durante o evento", async () => {
    const first = harness.serviceFor("user-a");
    const second = harness.serviceFor("user-b");
    await first.register("Mariana");
    await second.register("Rafael");

    harness.setTime(Date.parse(STARTS_AT));
    await playRound(first, "SIMPLE");

    const leaderboard = await first.getLeaderboard();

    expect(leaderboard.isFinal).toBe(false);
    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries[0].position).toBe(1);
    expect(leaderboard.entries[0].totalScore).toBeGreaterThanOrEqual(0);
    expect(leaderboard.entries[0].wordsSolved).toBeGreaterThanOrEqual(0);
  });

  it("encerra automaticamente quando todos concluem e publica a classificacao", async () => {
    const first = harness.serviceFor("user-a");
    const second = harness.serviceFor("user-b");
    await first.register("Mariana");
    await second.register("Rafael");

    harness.setTime(Date.parse(STARTS_AT));

    for (const service of [first, second]) {
      await playRound(service, "SIMPLE");
      await playRound(service, "DUET");
      await playRound(service, "QUARTET");
    }

    // Rafael erra o Sexteto inteiro; Mariana acerta tudo.
    await playRound(first, "SEXTET");

    const stateBefore = await second.getState();
    const sextetId = roundByMode(stateBefore, "SEXTET").id;
    await second.startRound(sextetId);
    for (const word of EXTRA_WORDS.slice(0, 11)) {
      await second.submitAttempt(sextetId, word);
    }

    const leaderboard = await first.getLeaderboard();

    expect(leaderboard.isFinal).toBe(true);
    expect(leaderboard.entries[0].displayName).toBe("Mariana");
    expect(leaderboard.entries[0].position).toBe(1);
    expect(leaderboard.entries[0].totalScore).toBe(1500);
    expect(leaderboard.entries[1].displayName).toBe("Rafael");
    expect(leaderboard.entries[1].wordsSolved).toBe(7);
  });

  it("encerra por tempo maximo e marca quem nao concluiu como abandono", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));
    await playRound(service, "SIMPLE");

    harness.setTime(Date.parse(STARTS_AT) + 181 * 60_000);
    const state = await service.getState();

    expect(state.championship?.status).toBe("FINISHED");
    expect(state.participant?.status).toBe("ABANDONED");
    expect(state.participant?.finalPosition).toBe(1);
  });

  it("revela todas as respostas apenas no resultado final", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));
    harness.engine.finishChampionship(harness.championshipId);

    const results = await service.getResults();
    const allAnswers = results.rounds.flatMap((round) => round.answers);

    expect(allAnswers).toHaveLength(13);
    expect(allAnswers).toContain("coçar");
    expect(results.participants[0].displayName).toBe("Mariana");
  });

  it("nao entrega resultados enquanto o campeonato nao encerrou", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));

    await expect(service.getResults()).rejects.toMatchObject({
      code: "CHAMPIONSHIP_NOT_FINISHED",
    });
  });

  it("registra o historico depois do encerramento", async () => {
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));
    await playRound(service, "SIMPLE");
    harness.engine.finishChampionship(harness.championshipId);

    const history = await service.getHistory();

    expect(history).toHaveLength(1);
    expect(history[0].participantCount).toBe(1);
    expect(history[0].podium[0].displayName).toBe("Mariana");
    expect(history[0].answers).toHaveLength(13);
    expect(history[0].myResult?.position).toBe(1);
  });
});

describe("Campeonato Diario - concorrencia e integridade", () => {
  it("numera as tentativas sem duplicar sob envios simultaneos", async () => {
    const harness = createHarness();
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));

    const state = await service.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleId);

    const results = await Promise.allSettled([
      service.submitAttempt(simpleId, "termo"),
      service.submitAttempt(simpleId, "livre"),
      service.submitAttempt(simpleId, "sonho"),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    const latest = await service.getState();
    const simple = roundByMode(latest, "SIMPLE");
    expect(simple.attemptsUsed).toBe(3);
    expect(simple.boards[0].rows).toHaveLength(3);
  });

  it("rejeita a segunda submissao identica enviada em paralelo", async () => {
    const harness = createHarness();
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));

    const state = await service.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleId);

    const results = await Promise.allSettled([
      service.submitAttempt(simpleId, "termo"),
      service.submitAttempt(simpleId, "termo"),
    ]);

    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ChampionshipError);
  });

  it("nao ultrapassa o limite de tentativas da modalidade", async () => {
    const harness = createHarness();
    const service = harness.serviceFor("user-a");
    await service.register("Mariana");
    harness.setTime(Date.parse(STARTS_AT));

    const state = await service.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;
    await service.startRound(simpleId);

    for (const word of EXTRA_WORDS.slice(0, 6)) {
      await service.submitAttempt(simpleId, word);
    }

    await expect(service.submitAttempt(simpleId, "vidro")).rejects.toMatchObject({
      code: "ROUND_ALREADY_FINISHED",
    });
  });

  it("exige inscricao para jogar", async () => {
    const harness = createHarness();
    const outsider = harness.serviceFor("user-x");
    harness.setTime(Date.parse(STARTS_AT));

    const state = await outsider.getState();
    const simpleId = roundByMode(state, "SIMPLE").id;

    await expect(outsider.startRound(simpleId)).rejects.toMatchObject({
      code: "NOT_REGISTERED",
    });
  });
});
