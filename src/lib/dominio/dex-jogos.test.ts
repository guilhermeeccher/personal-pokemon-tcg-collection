import { describe, expect, it } from "vitest";

import { ehJogoDex, JOGOS_DEX, jogoDex, LOCAL_HOME } from "./dex-jogos";

describe("catálogo de jogos da Living Dex", () => {
  it("ids únicos, e nenhum colide com o local do HOME", () => {
    const ids = JOGOS_DEX.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(LOCAL_HOME);
  });

  it("GO, FireRed e LeafGreen só enviam ao HOME (conferido em 2026-10-11)", () => {
    for (const id of ["go", "firered", "leafgreen"]) expect(jogoDex(id)?.conexaoHome).toBe("so_envio");
  });

  it("os jogos de Switch da era HOME vão e voltam", () => {
    for (const id of ["brilliant-diamond", "legends-arceus", "scarlet", "legends-za"]) {
      expect(jogoDex(id)?.conexaoHome).toBe("ida_e_volta");
    }
  });

  it("o HOME não é um jogo do catálogo", () => {
    expect(ehJogoDex(LOCAL_HOME)).toBe(false);
  });
});
