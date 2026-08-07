import { beforeEach, describe, expect, it } from "vitest";
import { LocalAccountEngine, LocalAccountService } from "./localAccountEngine";
import { isValidUsernameFormat } from "./username";
import type { SignUpInput } from "./types";

/**
 * Testes de contas e progresso.
 *
 * Rodam sobre o motor local, que espelha as migrations 08, 09 e 10.
 * Cobrem cadastro, unicidade de username, idempotencia do registro de
 * partida, calendario, sequencia, estatisticas e isolamento entre contas.
 */

const BASE_TIME = Date.parse("2026-08-06T15:00:00.000Z"); // 12:00 em Sao Paulo

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  return {
    username: "mariana",
    email: "mariana@email.com",
    password: "segredo123",
    passwordConfirmation: "segredo123",
    ...overrides,
  };
}

type Harness = {
  engine: LocalAccountEngine;
  service: LocalAccountService;
  setTime: (isoDate: string) => void;
  currentTime: () => number;
};

function createHarness(options: { requireEmailConfirmation?: boolean } = {}): Harness {
  let currentTime = BASE_TIME;

  const engine = new LocalAccountEngine({
    now: () => currentTime,
    requireEmailConfirmation: options.requireEmailConfirmation ?? false,
  });

  return {
    engine,
    service: new LocalAccountService(engine),
    // Define o "hoje" como meio-dia em Sao Paulo daquela data.
    setTime: (isoDate) => {
      currentTime = Date.parse(`${isoDate}T15:00:00.000Z`);
    },
    currentTime: () => currentTime,
  };
}

async function playGame(
  service: LocalAccountService,
  overrides: {
    id?: string;
    mode?: "SIMPLE" | "DUET" | "QUARTET" | "SEXTET";
    attemptsUsed?: number;
    wordsSolved?: number;
    durationMs?: number;
  } = {},
) {
  const mode = overrides.mode ?? "SIMPLE";
  const solvedByMode = { SIMPLE: 1, DUET: 2, QUARTET: 4, SEXTET: 6 } as const;

  return service.recordGame({
    // Prefixo garante o minimo de 8 caracteres exigido pelo servidor.
    clientGameId: `partida-${overrides.id ?? Math.random().toString(36).slice(2, 14)}`,
    mode,
    attemptsUsed: overrides.attemptsUsed ?? 3,
    wordsSolved: overrides.wordsSolved ?? solvedByMode[mode],
    durationMs: overrides.durationMs ?? 60_000,
    startedAt: null,
  });
}

describe("Cadastro e nome de usuario", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("cria conta e entra direto quando nao exige confirmacao", async () => {
    const result = await harness.service.signUp(signUpInput());

    expect(result.status).toBe("SIGNED_IN");

    const profile = await harness.service.getProfile();
    expect(profile?.username).toBe("mariana");
    expect(profile?.isPermanent).toBe(true);
  });

  it("pede confirmacao de e-mail quando o projeto exige", async () => {
    const confirmHarness = createHarness({ requireEmailConfirmation: true });
    const result = await confirmHarness.service.signUp(signUpInput());

    expect(result.status).toBe("CONFIRMATION_REQUIRED");
    // Sem confirmar, o login e recusado.
    await expect(
      confirmHarness.service.signIn("mariana@email.com", "segredo123"),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIRMED" });
  });

  it("recusa username ja usado, ignorando maiusculas", async () => {
    await harness.service.signUp(signUpInput());

    const other = new LocalAccountService(harness.engine);
    await expect(
      other.signUp(signUpInput({ username: "Mariana", email: "outra@email.com" })),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("recusa e-mail ja cadastrado", async () => {
    await harness.service.signUp(signUpInput());

    const other = new LocalAccountService(harness.engine);
    await expect(
      other.signUp(signUpInput({ username: "outra" })),
    ).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED" });
  });

  it("recusa senha curta e senhas diferentes", async () => {
    await expect(
      harness.service.signUp(
        signUpInput({ password: "123", passwordConfirmation: "123" }),
      ),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });

    await expect(
      harness.service.signUp(signUpInput({ passwordConfirmation: "outra-senha" })),
    ).rejects.toMatchObject({ code: "PASSWORD_MISMATCH" });
  });

  it("valida o formato do username", () => {
    expect(isValidUsernameFormat("mariana")).toBe(true);
    expect(isValidUsernameFormat("ma_ri.na-1")).toBe(true);
    expect(isValidUsernameFormat("ab")).toBe(false);
    expect(isValidUsernameFormat("nome com espaco")).toBe(false);
    expect(isValidUsernameFormat("_comeca_errado")).toBe(false);
    expect(isValidUsernameFormat("termina.")).toBe(false);
    expect(isValidUsernameFormat("a".repeat(21))).toBe(false);
  });

  it("informa disponibilidade antes do cadastro", async () => {
    await harness.service.signUp(signUpInput());

    const other = new LocalAccountService(harness.engine);
    expect(await other.checkUsername("mariana")).toEqual({
      available: false,
      reason: "USERNAME_TAKEN",
    });
    expect(await other.checkUsername("livre")).toEqual({ available: true, reason: null });
    expect(await other.checkUsername("ab")).toEqual({
      available: false,
      reason: "INVALID_USERNAME",
    });
  });

  it("login e logout funcionam e a sessao guarda quem entrou", async () => {
    await harness.service.signUp(signUpInput());
    harness.service.signOut();

    expect(harness.service.hasSession()).toBe(false);
    expect(await harness.service.getProfile()).toBeNull();

    await harness.service.signIn("mariana@email.com", "segredo123");
    expect(harness.service.hasSession()).toBe(true);
    expect((await harness.service.getProfile())?.username).toBe("mariana");
  });

  it("recusa credenciais erradas", async () => {
    await harness.service.signUp(signUpInput());

    await expect(
      harness.service.signIn("mariana@email.com", "senha-errada"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    await expect(
      harness.service.signIn("naoexiste@email.com", "segredo123"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("permite trocar o nome de usuario e libera o antigo", async () => {
    await harness.service.signUp(signUpInput());
    await harness.service.setUsername("mari");

    expect((await harness.service.getProfile())?.username).toBe("mari");

    const other = new LocalAccountService(harness.engine);
    await expect(
      other.signUp(signUpInput({ username: "mariana", email: "outra@email.com" })),
    ).resolves.toMatchObject({ status: "SIGNED_IN" });
  });
});

describe("Conversao de sessao anonima", () => {
  it("preserva o identificador, o historico e o acesso administrativo", async () => {
    const harness = createHarness();
    const anonymousId = harness.engine.createAnonymousUser("Jogador anonimo");
    harness.engine.addAdmin(anonymousId);

    const service = new LocalAccountService(harness.engine, anonymousId);
    await playGame(service, { id: "jogo-antes-da-conta" });

    expect(service.isAnonymousSession()).toBe(true);

    const result = await service.convertAnonymousAccount(signUpInput());

    expect(result.status).toBe("SIGNED_IN");
    // O identificador NAO muda: e isso que preserva tudo que aponta para ele.
    expect(service.getUserId()).toBe(anonymousId);

    const profile = await service.getProfile();
    expect(profile?.id).toBe(anonymousId);
    expect(profile?.isPermanent).toBe(true);
    expect(profile?.isAdmin).toBe(true);
    expect(profile?.username).toBe("mariana");

    // A partida jogada antes de criar a conta continua no historico.
    const stats = await service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(1);
  });

  it("nao converte para um username ja ocupado", async () => {
    const harness = createHarness();
    await harness.service.signUp(signUpInput());

    const anonymousId = harness.engine.createAnonymousUser("Outro");
    const anonymous = new LocalAccountService(harness.engine, anonymousId);

    await expect(
      anonymous.convertAnonymousAccount(
        signUpInput({ email: "outro@email.com" }),
      ),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });
});

describe("Registro de partidas", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.service.signUp(signUpInput());
  });

  it("uma partida finalizada cria um registro", async () => {
    const result = await playGame(harness.service, { id: "partida-1" });

    expect(result.recorded).toBe(true);
    expect(result.playedDate).toBe("2026-08-06");

    const stats = await harness.service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(1);
    expect(stats.stats.completedGames).toBe(1);
  });

  it("reenviar a mesma partida nao duplica nada", async () => {
    await playGame(harness.service, { id: "partida-repetida" });
    const second = await playGame(harness.service, { id: "partida-repetida" });

    expect(second.recorded).toBe(false);
    expect(second.alreadyRecorded).toBe(true);

    const stats = await harness.service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(1);
  });

  it("duas abas enviando ao mesmo tempo gravam uma vez so", async () => {
    const results = await Promise.all([
      playGame(harness.service, { id: "partida-simultanea" }),
      playGame(harness.service, { id: "partida-simultanea" }),
    ]);

    expect(results.filter((result) => result.recorded)).toHaveLength(1);

    const stats = await harness.service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(1);
  });

  it("partidas diferentes contam separadamente", async () => {
    await playGame(harness.service, { id: "partida-a", mode: "SIMPLE" });
    await playGame(harness.service, { id: "partida-b", mode: "DUET" });

    const stats = await harness.service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(2);
  });

  it("partida abandonada e recusada e nao vira dia jogado", async () => {
    await expect(
      harness.service.recordGame({
        clientGameId: "partida-abandonada",
        mode: "SIMPLE",
        attemptsUsed: 2,
        wordsSolved: 0,
        durationMs: 5000,
        startedAt: null,
      }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FINISHED" });

    const progress = await harness.service.getMonthProgress();
    expect(progress.days).toHaveLength(0);
    expect(progress.streak.current).toBe(0);
  });

  it("derrota com todas as tentativas usadas conta como partida jogada", async () => {
    const result = await harness.service.recordGame({
      clientGameId: "partida-perdida",
      mode: "SIMPLE",
      attemptsUsed: 6,
      wordsSolved: 0,
      durationMs: 90_000,
      startedAt: null,
    });

    expect(result.recorded).toBe(true);

    const stats = await harness.service.getPlayerStats(null, null);
    expect(stats.stats.games).toBe(1);
    expect(stats.stats.completedGames).toBe(0);
  });

  it("rejeita numeros incompativeis com a configuracao do modo", async () => {
    // Simples tem 1 palavra e 6 tentativas: nao da para inventar mais.
    await expect(
      harness.service.recordGame({
        clientGameId: "partida-inflada",
        mode: "SIMPLE",
        attemptsUsed: 3,
        wordsSolved: 9,
        durationMs: 1000,
        startedAt: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_WORDS_SOLVED" });

    await expect(
      harness.service.recordGame({
        clientGameId: "partida-inflada-2",
        mode: "SIMPLE",
        attemptsUsed: 99,
        wordsSolved: 1,
        durationMs: 1000,
        startedAt: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ATTEMPTS" });
  });

  it("rejeita identificador de partida invalido", async () => {
    await expect(
      harness.service.recordGame({
        clientGameId: "curto",
        mode: "SIMPLE",
        attemptsUsed: 1,
        wordsSolved: 1,
        durationMs: 1000,
        startedAt: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_GAME_ID" });
  });

  it("exige sessao para registrar", async () => {
    harness.service.signOut();

    await expect(playGame(harness.service)).rejects.toMatchObject({
      code: "NOT_AUTHENTICATED",
    });
  });
});

describe("Calendario e sequencia", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.service.signUp(signUpInput());
  });

  it("marca no calendario o dia em que jogou", async () => {
    await playGame(harness.service, { id: "dia-6" });

    const progress = await harness.service.getMonthProgress();
    expect(progress.days).toHaveLength(1);
    expect(progress.days[0].date).toBe("2026-08-06");
    expect(progress.days[0].games).toBe(1);
  });

  it("nao marca dias sem partida", async () => {
    harness.setTime("2026-08-03");
    await playGame(harness.service, { id: "dia-3" });
    harness.setTime("2026-08-06");

    const progress = await harness.service.getMonthProgress();
    expect(progress.days.map((day) => day.date)).toEqual(["2026-08-03"]);
  });

  it("usa a data de Sao Paulo, nao a do navegador", async () => {
    // 01:00 UTC do dia 7 ainda e dia 6 em Sao Paulo.
    const engine = new LocalAccountEngine({
      now: () => Date.parse("2026-08-07T01:00:00.000Z"),
    });
    const service = new LocalAccountService(engine);
    await service.signUp(signUpInput());
    const result = await playGame(service, { id: "virada-do-dia" });

    expect(result.playedDate).toBe("2026-08-06");
  });

  it("separa os meses corretamente", async () => {
    harness.setTime("2026-07-30");
    await playGame(harness.service, { id: "julho-30" });
    harness.setTime("2026-08-02");
    await playGame(harness.service, { id: "agosto-02" });

    const august = await harness.service.getMonthProgress("2026-08-01");
    const july = await harness.service.getMonthProgress("2026-07-01");

    expect(august.days.map((day) => day.date)).toEqual(["2026-08-02"]);
    expect(july.days.map((day) => day.date)).toEqual(["2026-07-30"]);
    expect(july.daysInMonth).toBe(31);
    expect(august.isCurrentMonth).toBe(true);
  });

  it("conta um dia de sequencia", async () => {
    await playGame(harness.service, { id: "unico-dia" });

    const streak = (await harness.service.getPlayerStats(null, null)).streak;
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it("conta dias consecutivos", async () => {
    for (const day of ["01", "02", "03", "04", "05", "06"]) {
      harness.setTime(`2026-08-${day}`);
      await playGame(harness.service, { id: `dia-${day}` });
    }

    const streak = (await harness.service.getPlayerStats(null, null)).streak;
    expect(streak.current).toBe(6);
    expect(streak.longest).toBe(6);
  });

  it("zera a sequencia quando um dia inteiro passa sem jogar", async () => {
    for (const day of ["01", "02", "03"]) {
      harness.setTime(`2026-08-${day}`);
      await playGame(harness.service, { id: `dia-${day}` });
    }

    // Pulou o dia 4 e o dia 5: no dia 5 a sequencia ja morreu.
    harness.setTime("2026-08-05");
    const streak = (await harness.service.getPlayerStats(null, null)).streak;

    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(3);
  });

  it("mantem a sequencia viva no dia seguinte antes de jogar", async () => {
    harness.setTime("2026-08-05");
    await playGame(harness.service, { id: "dia-5" });

    harness.setTime("2026-08-06");
    const streak = (await harness.service.getPlayerStats(null, null)).streak;

    expect(streak.current).toBe(1);
    expect(streak.atRisk).toBe(true);
  });

  it("atravessa a virada de mes", async () => {
    for (const date of ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]) {
      harness.setTime(date);
      await playGame(harness.service, { id: `dia-${date}` });
    }

    const streak = (await harness.service.getPlayerStats(null, null)).streak;
    expect(streak.current).toBe(4);
    expect(streak.longest).toBe(4);
  });

  it("guarda a maior sequencia mesmo depois de quebrar", async () => {
    for (const day of ["01", "02", "03", "04", "05"]) {
      harness.setTime(`2026-08-${day}`);
      await playGame(harness.service, { id: `primeira-${day}` });
    }

    for (const day of ["10", "11"]) {
      harness.setTime(`2026-08-${day}`);
      await playGame(harness.service, { id: `segunda-${day}` });
    }

    const streak = (await harness.service.getPlayerStats(null, null)).streak;
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(5);
  });

  it("conta dias possiveis ate hoje no mes corrente", async () => {
    harness.setTime("2026-08-10");
    await playGame(harness.service, { id: "dia-10" });

    const progress = await harness.service.getMonthProgress();
    expect(progress.daysPossible).toBe(10);
    expect(progress.daysInMonth).toBe(31);
  });
});

describe("Estatisticas", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.service.signUp(signUpInput());
  });

  it("agrega por modo com as regras certas de cada um", async () => {
    await playGame(harness.service, { id: "s1", mode: "SIMPLE", attemptsUsed: 3, wordsSolved: 1 });
    await playGame(harness.service, { id: "s2", mode: "SIMPLE", attemptsUsed: 6, wordsSolved: 0 });
    await playGame(harness.service, { id: "d1", mode: "DUET", attemptsUsed: 5, wordsSolved: 2 });
    await playGame(harness.service, { id: "q1", mode: "QUARTET", attemptsUsed: 9, wordsSolved: 3 });
    await playGame(harness.service, { id: "x1", mode: "SEXTET", attemptsUsed: 12, wordsSolved: 6 });

    const stats = (await harness.service.getPlayerStats(null, null)).stats;
    const byMode = Object.fromEntries(stats.byMode.map((entry) => [entry.mode, entry]));

    expect(byMode.SIMPLE.games).toBe(2);
    expect(byMode.SIMPLE.completed).toBe(1);
    expect(byMode.SIMPLE.completionRate).toBe(50);
    expect(byMode.SIMPLE.bestAttempts).toBe(3);

    // Quarteto incompleto: 3 de 4 palavras, nao conta como conclusao.
    expect(byMode.QUARTET.completed).toBe(0);
    expect(byMode.QUARTET.wordsSolved).toBe(3);
    expect(byMode.QUARTET.wordsTotal).toBe(4);

    expect(byMode.SEXTET.completed).toBe(1);
    expect(byMode.SEXTET.wordsTotal).toBe(6);

    expect(stats.games).toBe(5);
    expect(stats.completedGames).toBe(3);
    expect(stats.attempts).toBe(35);
  });

  it("filtra por periodo", async () => {
    harness.setTime("2026-07-15");
    await playGame(harness.service, { id: "julho" });
    harness.setTime("2026-08-06");
    await playGame(harness.service, { id: "agosto-a" });
    await playGame(harness.service, { id: "agosto-b" });

    const july = await harness.service.getPlayerStats("2026-07-01", "2026-07-31");
    const august = await harness.service.getPlayerStats("2026-08-01", "2026-08-31");
    const all = await harness.service.getPlayerStats(null, null);

    expect(july.stats.games).toBe(1);
    expect(august.stats.games).toBe(2);
    expect(all.stats.games).toBe(3);
  });

  it("compara dois periodos numa chamada", async () => {
    harness.setTime("2026-07-10");
    await playGame(harness.service, { id: "julho-1" });
    harness.setTime("2026-08-06");
    await playGame(harness.service, { id: "agosto-1" });
    await playGame(harness.service, { id: "agosto-2" });

    const comparison = await harness.service.comparePeriods(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(comparison.first.games).toBe(1);
    expect(comparison.second.games).toBe(2);
  });

  it("resume o mes com dias ativos e aproveitamento", async () => {
    harness.setTime("2026-08-01");
    await playGame(harness.service, { id: "m1", attemptsUsed: 3, wordsSolved: 1 });
    harness.setTime("2026-08-02");
    await playGame(harness.service, { id: "m2", attemptsUsed: 6, wordsSolved: 0 });
    harness.setTime("2026-08-06");

    const progress = await harness.service.getMonthProgress();

    expect(progress.summary.games).toBe(2);
    expect(progress.summary.activeDays).toBe(2);
    expect(progress.summary.completionRate).toBe(50);
  });
});

describe("Isolamento entre contas", () => {
  it("uma conta nao enxerga o progresso da outra", async () => {
    const harness = createHarness();
    await harness.service.signUp(signUpInput());
    await playGame(harness.service, { id: "partida-da-mariana" });

    const other = new LocalAccountService(harness.engine);
    await other.signUp(signUpInput({ username: "rafael", email: "rafael@email.com" }));

    const mine = await harness.service.getPlayerStats(null, null);
    const theirs = await other.getPlayerStats(null, null);

    expect(mine.stats.games).toBe(1);
    expect(theirs.stats.games).toBe(0);
  });

  it("o progresso e sempre resolvido pela sessao, nunca por parametro", async () => {
    const harness = createHarness();
    await harness.service.signUp(signUpInput());
    await playGame(harness.service, { id: "partida-privada" });

    const other = new LocalAccountService(harness.engine);
    await other.signUp(signUpInput({ username: "rafael", email: "rafael@email.com" }));

    // Nenhum metodo da interface aceita "de quem" e o progresso: nao ha
    // parametro de user id para trocar.
    const progress = await other.getMonthProgress();
    expect(progress.days).toHaveLength(0);
  });

  it("sem sessao nao ha progresso nem perfil", async () => {
    const harness = createHarness();
    const anonymous = new LocalAccountService(harness.engine);

    expect(await anonymous.getProfile()).toBeNull();
    await expect(anonymous.getMonthProgress()).rejects.toMatchObject({
      code: "NOT_AUTHENTICATED",
    });
  });
});

describe("Meta diaria", () => {
  it("comeca em 3 partidas e pode ser ajustada", async () => {
    const harness = createHarness();
    await harness.service.signUp(signUpInput());

    let summary = await harness.service.getHomeSummary();
    expect(summary.dailyGoal).toBe(3);
    expect(summary.todayGames).toBe(0);

    await playGame(harness.service, { id: "meta-1" });
    await harness.service.setDailyGoal(1);

    summary = await harness.service.getHomeSummary();
    expect(summary.dailyGoal).toBe(1);
    expect(summary.todayGames).toBe(1);
  });

  it("recusa meta fora do intervalo", async () => {
    const harness = createHarness();
    await harness.service.signUp(signUpInput());

    await expect(harness.service.setDailyGoal(0)).rejects.toMatchObject({
      code: "INVALID_DAILY_GOAL",
    });
    await expect(harness.service.setDailyGoal(50)).rejects.toMatchObject({
      code: "INVALID_DAILY_GOAL",
    });
  });
});
