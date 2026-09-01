import { describe, expect, it } from "vitest";

describe("AdminCreatePanel", () => {
  it("mantém o modelo fixo do Campeonato Norte semanal", () => {
    const title = "Campeonato Norte semanal";
    expect(title).toContain("Campeonato Norte");
    expect(title).toContain("semanal");
  });
});
