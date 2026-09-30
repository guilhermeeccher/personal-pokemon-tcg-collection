import { describe, expect, it } from "vitest";

import {
  chaveVagaSet,
  compararChavesVaga,
  lerChaveVagaSet,
  rotuloChaveVaga,
} from "./chave-vaga-set";

describe("chave de vaga de set", () => {
  it("ida e volta, com set que tem hífen e ponto no id", () => {
    expect(chaveVagaSet("30th-c", "001")).toBe("30th-c/001");
    expect(lerChaveVagaSet("30th-c/001")).toEqual({ setId: "30th-c", localId: "001" });
    expect(lerChaveVagaSet(chaveVagaSet("sv03.5", "TG01"))).toEqual({
      setId: "sv03.5",
      localId: "TG01",
    });
  });

  it("chave de Pokédex ou customizada não é chave de set", () => {
    expect(lerChaveVagaSet("25")).toBeNull();
    expect(lerChaveVagaSet("/001")).toBeNull();
    expect(lerChaveVagaSet("30th/")).toBeNull();
  });

  it("o rótulo é o número impresso", () => {
    expect(rotuloChaveVaga("30th/B")).toBe("B");
    expect(rotuloChaveVaga("151")).toBe("151");
  });
});

describe("compararChavesVaga", () => {
  it("ordena pela ordem da receita e, dentro do set, pela ordem impressa", () => {
    const chaves = ["30th-c/002", "30th/010", "30th/2", "30th-c/001", "30th/1"];
    expect(chaves.sort(compararChavesVaga(["30th", "30th-c"]))).toEqual([
      "30th/1",
      "30th/2",
      "30th/010",
      "30th-c/001",
      "30th-c/002",
    ]);
  });

  it("set fora da receita (carta avulsa) vai depois, em ordem alfabética", () => {
    const chaves = ["me01/005", "base1/4", "30th/001"];
    expect(chaves.sort(compararChavesVaga(["30th"]))).toEqual([
      "30th/001",
      "base1/4",
      "me01/005",
    ]);
  });

  it("chaves de Pokédex seguem a ordem numérica", () => {
    expect(["10", "2", "1"].sort(compararChavesVaga())).toEqual(["1", "2", "10"]);
  });
});
