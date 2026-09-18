import { describe, expect, it } from "vitest";

import { derivarForma } from "./forma";

describe("derivarForma", () => {
  it("carta sem forma regional vira normal", () => {
    expect(derivarForma("Raichu")).toBe("normal");
  });

  it("critério de aceite da Fase 0: Raichu de Alola -> alola", () => {
    expect(derivarForma("Raichu de Alola")).toBe("alola");
  });

  it("reconhece Alola em pt e en", () => {
    expect(derivarForma("Exeggutor de Alola")).toBe("alola");
    expect(derivarForma("Alolan Exeggutor")).toBe("alola");
    expect(derivarForma("Rowlet e Exeggutor de Alola GX")).toBe("alola");
  });

  it("reconhece Galar em pt e en", () => {
    expect(derivarForma("Darmanitan de Galar")).toBe("galar");
    expect(derivarForma("Galarian Darmanitan")).toBe("galar");
  });

  it("reconhece Hisui em pt e en", () => {
    expect(derivarForma("Voltorb de Hisui")).toBe("hisui");
    expect(derivarForma("Hisuian Voltorb")).toBe("hisui");
  });

  it("reconhece Paldea em pt e en", () => {
    expect(derivarForma("Tauros de Paldea")).toBe("paldea");
    expect(derivarForma("Paldean Tauros")).toBe("paldea");
  });

  it("reconhece Mega sem confundir com nomes que contêm 'mega'", () => {
    expect(derivarForma("Mega Venusaur ex")).toBe("mega");
    expect(derivarForma("Mega Meganium ex")).toBe("mega");
    expect(derivarForma("Yanmega ex")).toBe("normal");
    expect(derivarForma("Meganium")).toBe("normal");
  });

  it("Gigantamax não tem ocorrência real hoje: nunca chuta a partir de VMAX", () => {
    expect(derivarForma("Gigantamax Butterfree")).toBe("gigantamax");
    expect(derivarForma("Butterfree VMAX")).toBe("normal");
    expect(derivarForma("Copperajah VMAX")).toBe("normal");
  });

  it("formato legado 'M Nome EX' não é reconhecido (gap documentado)", () => {
    expect(derivarForma("M Charizard EX")).toBe("normal");
  });

  it("string vazia vira normal", () => {
    expect(derivarForma("")).toBe("normal");
  });
});
