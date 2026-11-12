import { describe, expect, it } from "vitest";

import { nomeNaLiga } from "./nome-liga";

describe("nomeNaLiga", () => {
  it("deixa como está o nome que a Liga escreve igual", () => {
    expect(nomeNaLiga("Bulbasaur")).toBe("Bulbasaur");
    expect(nomeNaLiga("Charizard ex")).toBe("Charizard ex");
    expect(nomeNaLiga("Ultra Ball")).toBe("Ultra Ball");
  });

  it("prende a mecânica em caixa alta por hífen", () => {
    expect(nomeNaLiga("Umbreon GX")).toBe("Umbreon-GX");
    expect(nomeNaLiga("M Blastoise EX")).toBe("M Blastoise-EX");
    expect(nomeNaLiga("Mewtwo VSTAR")).toBe("Mewtwo-VSTAR");
    expect(nomeNaLiga("Machamp VMAX")).toBe("Machamp-VMAX");
    expect(nomeNaLiga("Ho-Oh V")).toBe("Ho-Oh-V");
  });

  it("não prende BREAK, G, GL, FB nem LEGEND", () => {
    expect(nomeNaLiga("Greninja BREAK")).toBe("Greninja BREAK");
    expect(nomeNaLiga("Crobat G")).toBe("Crobat G");
    expect(nomeNaLiga("Machamp GL")).toBe("Machamp GL");
    expect(nomeNaLiga("Dragonite FB")).toBe("Dragonite FB");
    expect(nomeNaLiga("Darkrai & Cresselia LEGEND")).toBe("Darkrai & Cresselia LEGEND");
  });

  it("tira o δ e escreve o Prism Star por extenso", () => {
    expect(nomeNaLiga("Cyndaquil δ")).toBe("Cyndaquil");
    expect(nomeNaLiga("Ditto ◇")).toBe("Ditto Prism Star");
  });

  it("tira o E da Elite Four", () => {
    expect(nomeNaLiga("Flareon E4")).toBe("Flareon 4");
  });

  it("escreve Nidoran por extenso", () => {
    expect(nomeNaLiga("Nidoran♂")).toBe("Nidoran Male");
    expect(nomeNaLiga("Giovanni's Nidoran ♀")).toBe("Giovanni's Nidoran Female");
    expect(nomeNaLiga("Nidoran♀ δ")).toBe("Nidoran Female");
  });

  it("tira o colchete do Unown sem confundir a letra V com a mecânica", () => {
    expect(nomeNaLiga("Unown [E]")).toBe("Unown E");
    expect(nomeNaLiga("Unown [V]")).toBe("Unown V");
  });

  it("troca o apóstrofo curvo pelo reto", () => {
    expect(nomeNaLiga("Farfetch’d")).toBe("Farfetch'd");
  });
});
