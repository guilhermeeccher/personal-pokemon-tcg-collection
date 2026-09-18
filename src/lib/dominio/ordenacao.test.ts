import { describe, expect, it } from "vitest";

import { compararLocalId } from "./ordenacao";

describe("compararLocalId", () => {
  it("ordena números sem padding na ordem correta (não alfabética)", () => {
    const ids = ["10", "2", "1", "100", "9"];
    expect(ids.sort(compararLocalId)).toEqual(["1", "2", "9", "10", "100"]);
  });

  it("ordena números com zero-padding corretamente (sets recentes)", () => {
    const ids = ["003", "001", "010", "002"];
    expect(ids.sort(compararLocalId)).toEqual(["001", "002", "003", "010"]);
  });

  it("trata sufixo de letra (secretas 'a'/'b') mantendo o número como chave primária", () => {
    const ids = ["103a", "50b", "50a", "9"];
    expect(ids.sort(compararLocalId)).toEqual(["9", "50a", "50b", "103a"]);
  });

  it("trata prefixo de letra (séries especiais H/TG) numericamente dentro do prefixo", () => {
    const ids = ["H10", "H2", "H1"];
    expect(ids.sort(compararLocalId)).toEqual(["H1", "H2", "H10"]);
  });
});
