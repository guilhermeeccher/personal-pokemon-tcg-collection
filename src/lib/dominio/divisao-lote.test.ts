import { describe, expect, it } from "vitest";

import { planejarAlocacaoDeLote } from "./divisao-lote";

describe("planejarAlocacaoDeLote", () => {
  it("quantidade 1 aloca direto, sem dividir", () => {
    expect(planejarAlocacaoDeLote(1)).toEqual({
      dividir: false,
      quantidadeRestanteNaOriginal: 0,
    });
  });

  it("quantidade 3 divide: original fica com 2, nova nasce com 1", () => {
    expect(planejarAlocacaoDeLote(3)).toEqual({
      dividir: true,
      quantidadeRestanteNaOriginal: 2,
    });
  });

  it("quantidade 2 divide: original fica com 1", () => {
    expect(planejarAlocacaoDeLote(2)).toEqual({
      dividir: true,
      quantidadeRestanteNaOriginal: 1,
    });
  });

  it("rejeita quantidade 0", () => {
    expect(() => planejarAlocacaoDeLote(0)).toThrow();
  });

  it("rejeita quantidade negativa", () => {
    expect(() => planejarAlocacaoDeLote(-1)).toThrow();
  });

  it("rejeita quantidade não inteira", () => {
    expect(() => planejarAlocacaoDeLote(1.5)).toThrow();
  });
});
