import { beforeEach, describe, expect, it } from "vitest";
import { LocalChampionshipEngine, LocalChampionshipService } from "../championship/localEngine";
import type { ChampionshipMode } from "../championship/types";
import { LocalAccountEngine, LocalAccountService } from "./localAccountEngine";
import type { SignUpInput } from "./types";

/**
 * Integracao entre a conta permanente e o Campeonato Diario.
 *
 * O ponto central: o progresso pessoal DERIVA das tabelas do campeonato
 * em vez de copiar os dados. Estes testes ligam os dois motores e
 * verificam que o calendario, a sequencia e as estatisticas enxergam a
 * participacao sem que nada seja duplicado.
 */

const ANSWERS: Record<ChampionshipMode, string[]> = {
  SIMPLE: ["coçar"],
  DUET: ["banho", "carro"],
  QUARTET: ["dados", "festa", "gelos", "hotel"],
  SEXTET: ["jovem", "lapis", "manga", "navio", "olhos", "praia"],
};

const ALL_ANSWERS = Object.values(ANSWERS).flat();
const EXTRA_WORDS = ["termo", "livre", "sonho", "vidro", "porta", "verde", "campo", "tarde"];

// 12:00 em Sao Paulo do dia 6.
const BASE_TIME = Date.parse("2026-08-06T15:00:00.000Z");

type Harness = {
  championshipEngine: LocalChampionshipEngine;
  accountEngine: LocalAccountEngine;
  championshipId: string;
  admin: LocalChampionshipService;
  setTime: (value: number) => void;
  currentTime: () => number;
};

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  return {
    username: "mariana",
    email: "mariana@email.com",
    password: "segredo123",
    passwordConfirmation: "segredo123",
    ...overrides,
  };
}

function createHarness(): Harness {
  let currentTime = BASE_TIME;
  const now = () => currentTime;

  const championshipEngine = new LocalChampionshipEngine({
    answerPool: [...ALL_ANSWERS, ...EXTRA_WORDS],
    validWords: [...ALL_ANSWERS, ...EXTRA_WORDS],
    now,
    random: () => 0.42,
  });

  championshipEngine.addAdmin("admin-user");

  const championship = championshipEngine.createChampionship({
    championshipDate: "2026-08-06",
    registrationOpensAt: new Date(BASE_TIME - 3_600_000).toISOString(),
    registrationClosesAt: new Date(BASE_TIME + 3_600_000).toISOString(),
    startsAt: new Date(BASE_TIME + 7_200_000).toISOString(),
  });

  championshipEngine.setAnswers(championship.id, ANSWERS);

  const accountEngine = new LocalAccountEngine({
    now,
    // O progresso le o campeonato: nada e copiado.
    championshipSource: {
      getParticipations: (userId) => championshipEngine.getParticipations(userId),
      getOfficialChampionships: () => championshipEngine.getOfficialChampionships(),
    },
  });

  return {
    championshipEngine,
    accountEngine,
    championshipId: championship.id,
    admin: new LocalChampionshipService(championshipEngine, "admin-user"),
    setTime: (value) => {
      currentTime = value;
    },
    currentTime: () => currentTime,
  };
}

describe("Conta permanente no Campeonato Diario", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("a conta consegue se inscrever e o username aparece no campeonato", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    const state = await championship.register("mariana", harness.championshipId);

    expect(state.participant?.displayName).toBe("mariana");
    expect(state.championship?.participantCount).toBe(1);
  });

  it("a participacao entra no progresso pessoal sem virar partida duplicada", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    await championship.register("mariana", harness.championshipId);
    await harness.admin.startChampionshipNow(harness.championshipId);

    const state = await championship.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await championship.startRound(simpleId);
    await championship.submitAttempt(simpleId, "coçar");

    const progress = await account.getMonthProgress();
    const day = progress.days.find((item) => item.date === "2026-08-06");

    // O dia conta como jogado por causa do campeonato...
    expect(day).toBeTruthy();
    expect(day?.championship).toBeTruthy();
    // ...mas nenhuma partida de Jogo Livre foi inventada.
    expect(day?.games).toBe(0);
    expect(progress.streak.current).toBe(1);
  });

  it("inscrever-se sem jogar nao conta como dia jogado", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    await championship.register("mariana", harness.championshipId);

    const progress = await account.getMonthProgress();
    expect(progress.days).toHaveLength(0);
    expect(progress.streak.current).toBe(0);
  });

  it("o resultado do campeonato aparece nas estatisticas depois do encerramento", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    await championship.register("mariana", harness.championshipId);
    await harness.admin.startChampionshipNow(harness.championshipId);

    const state = await championship.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await championship.startRound(simpleId);
    await championship.submitAttempt(simpleId, "coçar");

    harness.championshipEngine.finishChampionship(harness.championshipId);

    const stats = (await account.getPlayerStats(null, null)).stats;

    expect(stats.championship.played).toBe(1);
    expect(stats.championship.wins).toBe(1);
    expect(stats.championship.podiums).toBe(1);
    expect(stats.championship.bestPosition).toBe(1);
    // Simples resolvido de primeira: 100 + 5 tentativas restantes x 10.
    expect(stats.championship.bestScore).toBe(150);
    // Nao inventa partidas de Jogo Livre.
    expect(stats.games).toBe(0);
  });

  it("o historico marca campeonatos disputados e nao disputados", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    await championship.register("mariana", harness.championshipId);
    await harness.admin.startChampionshipNow(harness.championshipId);

    const state = await championship.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await championship.startRound(simpleId);
    await championship.submitAttempt(simpleId, "coçar");
    harness.championshipEngine.finishChampionship(harness.championshipId);

    // Um segundo campeonato, em outro dia, sem participacao.
    harness.setTime(Date.parse("2026-08-07T15:00:00.000Z"));
    const second = harness.championshipEngine.createChampionship({
      championshipDate: "2026-08-07",
      registrationOpensAt: "2026-08-07T12:00:00.000Z",
      registrationClosesAt: "2026-08-07T22:00:00.000Z",
      startsAt: "2026-08-07T23:00:00.000Z",
    });
    harness.championshipEngine.finishChampionship(second.id);

    const history = await account.getChampionshipHistory(10, 0);

    expect(history).toHaveLength(2);
    const notPlayed = history.find((item) => item.championshipDate === "2026-08-07");
    const played = history.find((item) => item.championshipDate === "2026-08-06");

    // "Nao participou" nao e armazenado: e derivado.
    expect(notPlayed?.participated).toBe(false);
    expect(notPlayed?.position).toBeNull();
    expect(played?.participated).toBe(true);
    expect(played?.position).toBe(1);
    expect(played?.wordsTotal).toBe(13);
  });

  it("o calendario marca os dias com campeonato mesmo sem participacao", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());

    const progress = await account.getMonthProgress();
    expect(progress.championshipDays).toContain("2026-08-06");
    // Sem participacao, o dia nao aparece como jogado.
    expect(progress.days).toHaveLength(0);
  });

  it("Jogo Livre e campeonato somam no mesmo dia sem se atrapalhar", async () => {
    const account = new LocalAccountService(harness.accountEngine);
    await account.signUp(signUpInput());
    const userId = account.getUserId()!;

    await account.recordGame({
      clientGameId: "jogo-livre-do-dia",
      mode: "DUET",
      attemptsUsed: 5,
      wordsSolved: 2,
      durationMs: 120_000,
      startedAt: null,
    });

    const championship = new LocalChampionshipService(harness.championshipEngine, userId);
    await championship.register("mariana", harness.championshipId);
    await harness.admin.startChampionshipNow(harness.championshipId);
    const state = await championship.getState();
    const simpleId = state.rounds.find((round) => round.mode === "SIMPLE")!.id;
    await championship.startRound(simpleId);
    await championship.submitAttempt(simpleId, "coçar");

    const progress = await account.getMonthProgress();
    const day = progress.days.find((item) => item.date === "2026-08-06");

    expect(day?.games).toBe(1);
    expect(day?.byMode.DUET).toBe(1);
    expect(day?.championship).toBeTruthy();
    // 2 palavras do Dueto + 1 do campeonato.
    expect(day?.wordsSolved).toBe(3);
  });

  it("o campeonato continua funcionando para quem nao tem conta permanente", async () => {
    // Sessao anonima, como antes das contas existirem.
    const anonymousId = harness.accountEngine.createAnonymousUser("Visitante");
    const championship = new LocalChampionshipService(harness.championshipEngine, anonymousId);

    const state = await championship.register("Visitante", harness.championshipId);
    expect(state.participant?.displayName).toBe("Visitante");

    await harness.admin.startChampionshipNow(harness.championshipId);
    const started = await championship.getState();
    expect(started.championship?.status).toBe("IN_PROGRESS");
  });
});
