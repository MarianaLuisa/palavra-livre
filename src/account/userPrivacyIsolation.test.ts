import { describe, expect, it } from "vitest";
import { LocalChampionshipEngine, LocalChampionshipService } from "../championship/localEngine";
import { LocalAccountEngine, LocalAccountService } from "./localAccountEngine";

describe("Isolamento de Privacidade entre Usuários", () => {
  it("um usuário não visualiza o detalhamento de rodadas de outros usuários nos resultados", async () => {
    const champEngine = new LocalChampionshipEngine(Date.parse("2026-09-01T12:00:00-03:00"));
    const champId = champEngine.ensureCurrentNorteRound("2026-09-01")!;

    const user1 = "user-alice";
    const user2 = "user-bob";

    champEngine.upsertProfile(user1, "Alice");
    champEngine.upsertProfile(user2, "Bob");

    champEngine.register(user1, "Alice", champId);
    champEngine.register(user2, "Bob", champId);

    // Finalizar campeonato
    champEngine.finishChampionship(champId);

    // Alice requisita os resultados
    const aliceResults = champEngine.getResults(champId, user1);

    const aliceParticipant = aliceResults.participants.find((p) => p.userId === user1);
    const bobParticipant = aliceResults.participants.find((p) => p.userId === user2);

    expect(aliceParticipant).toBeDefined();
    expect(bobParticipant).toBeDefined();

    // Alice tem suas rodadas preenchidas
    expect(aliceParticipant?.rounds.length).toBeGreaterThan(0);

    // Bob NÃO tem detalhes de rodadas abertas para Alice (rounds deve ser array vazio para outros)
    expect(bobParticipant?.rounds).toEqual([]);
  });

  it("o histórico do usuário retorna estritamente os seus próprios jogos", async () => {
    const accountEngine = new LocalAccountEngine(Date.parse("2026-09-01T12:00:00-03:00"));
    const aliceService = new LocalAccountService(accountEngine);
    const bobService = new LocalAccountService(accountEngine);

    await aliceService.signUp({
      username: "alice",
      email: "alice@email.com",
      password: "password123",
      passwordConfirmation: "password123",
    });

    await bobService.signUp({
      username: "bob",
      email: "bob@email.com",
      password: "password123",
      passwordConfirmation: "password123",
    });

    // Alice registra um jogo livre
    await aliceService.recordGame({
      clientGameId: "game-alice-001",
      mode: "SIMPLE",
      attemptsUsed: 3,
      wordsSolved: 1,
      durationMs: 45_000,
      startedAt: null,
    });

    // Bob registra um jogo livre
    await bobService.recordGame({
      clientGameId: "game-bob-000002",
      mode: "DUET",
      attemptsUsed: 5,
      wordsSolved: 2,
      durationMs: 80_000,
      startedAt: null,
    });

    const aliceProgress = await aliceService.getMonthProgress();
    const bobProgress = await bobService.getMonthProgress();

    // Alice só vê seu jogo simples
    expect(aliceProgress.summary.games).toBe(1);
    expect(aliceProgress.summary.byMode.find((m) => m.mode === "SIMPLE")?.games).toBe(1);
    expect(aliceProgress.summary.byMode.find((m) => m.mode === "DUET")?.games).toBe(0);

    // Bob só vê seu jogo dueto
    expect(bobProgress.summary.games).toBe(1);
    expect(bobProgress.summary.byMode.find((m) => m.mode === "DUET")?.games).toBe(1);
    expect(bobProgress.summary.byMode.find((m) => m.mode === "SIMPLE")?.games).toBe(0);
  });
});
