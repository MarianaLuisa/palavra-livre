import { describe, expect, it } from "vitest";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES, FREE_PLAY_BRAND } from "../championship/config";

describe("Navegação Principal do Cabeçalho", () => {
  it("contém os itens de menu padronizados: Campeonatos, Classificação, Histórico e Jogo Livre", () => {
    const navItems = [
      { to: CHAMPIONSHIP_ROUTES.championship, label: CHAMPIONSHIP_BRAND.shortName },
      { to: CHAMPIONSHIP_ROUTES.leaderboard, label: "Classificação" },
      { to: CHAMPIONSHIP_ROUTES.history, label: "Histórico" },
      { to: CHAMPIONSHIP_ROUTES.freePlay, label: FREE_PLAY_BRAND.shortName },
    ];

    expect(navItems[0].label).toBe("Campeonatos");
    expect(navItems[0].to).toBe("/campeonato");

    expect(navItems[1].label).toBe("Classificação");
    expect(navItems[1].to).toBe("/campeonato/classificacao");

    expect(navItems[2].label).toBe("Histórico");
    expect(navItems[2].to).toBe("/campeonato/historico");

    expect(navItems[3].label).toBe("Jogo Livre");
    expect(navItems[3].to).toBe("/jogo-livre");
  });
});
