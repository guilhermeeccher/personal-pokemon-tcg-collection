import { describe, expect, it } from "vitest";

import { nomeTransicaoCarta } from "./nome-transicao";

describe("nomeTransicaoCarta", () => {
  it("só o par ativo leva nome", () => {
    expect(nomeTransicaoCarta("30th/001", false)).toBeUndefined();
    expect(nomeTransicaoCarta("30th/001", true)).toBeDefined();
  });

  it("vira identificador CSS válido", () => {
    for (const chave of ["30th/001", "25", "sv3.5/199", "Ação é"]) {
      expect(nomeTransicaoCarta(chave, true)).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    }
  });

  it("chaves diferentes não colidem depois de escapadas", () => {
    const chaves = ["30th/001", "30th_001", "30th-001", "30th_2f_001"];
    const nomes = chaves.map((c) => nomeTransicaoCarta(c, true));
    expect(new Set(nomes).size).toBe(chaves.length);
  });
});
