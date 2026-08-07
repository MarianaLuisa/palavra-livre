import { describe, expect, it } from "vitest";
import { repairMojibake, repairMojibakeList } from "./repairMojibake";

describe("repairMojibake", () => {
  it("corrige acentos UTF-8 exibidos como Windows-1252", () => {
    expect(repairMojibake("Ã³tico")).toBe("ótico");
    expect(repairMojibake("Ã³bvia")).toBe("óbvia");
    expect(repairMojibake("laÃ§os")).toBe("laços");
    expect(repairMojibake("dÃ©bil")).toBe("débil");
    expect(repairMojibake("Ãªxodo")).toBe("êxodo");
  });

  it("corrige mojibake duplo quando necessario", () => {
    expect(repairMojibake("ÃƒÂ³tico")).toBe("ótico");
    expect(repairMojibake("laÃƒÂ§os")).toBe("laços");
  });

  it("mantem palavras ja corretas", () => {
    expect(repairMojibake("ótico")).toBe("ótico");
    expect(repairMojibake("laços")).toBe("laços");
    expect(repairMojibake("sugar")).toBe("sugar");
  });

  it("corrige listas de palavras", () => {
    expect(repairMojibakeList(["porto", "laÃ§os", "Ãªxodo"])).toEqual([
      "porto",
      "laços",
      "êxodo",
    ]);
  });
});
