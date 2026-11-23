import { describe, expect, it } from "vitest";

import { CAMPOS_HERDADOS_NA_DIVISAO, parteSeparadaDoLote, planejarAlocacaoDeLote } from "./divisao-lote";

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

describe("parteSeparadaDoLote", () => {
  // Uma linha de `copia` inteira, com valores inventados, como o SELECT a devolve.
  const original = {
    id: "00000000-0000-4000-8000-000000000001",
    cartaId: "sv01-001",
    idiomaCatalogo: "en",
    idioma: "pt",
    variante: "reverse",
    quantidade: 3,
    condicao: "NM",
    gradedEmpresa: "PSA",
    gradedNota: "9",
    gradedCertificado: "123",
    localizacao: "Pasta A",
    aquisicaoData: "2026-01-02",
    aquisicaoOrigem: "Loja",
    aquisicaoPreco: "12.50",
    notas: "nota",
    criadoEm: new Date("2025-03-04T15:00:00.000Z"),
    atualizadoEm: new Date("2026-11-20T10:00:00.000Z"),
  };

  it("guarda a data de cadastro da original — dividir não é cadastrar", () => {
    const parte = parteSeparadaDoLote(original);
    expect(parte.criadoEm).toBe(original.criadoEm);
  });

  it("nasce com 1 unidade e herda todo o resto, menos id e atualizado_em", () => {
    const parte = parteSeparadaDoLote(original);
    const { id: _id, atualizadoEm: _atualizado, quantidade: _quantidade, ...herdados } = original;
    expect(parte).toEqual({ ...herdados, quantidade: 1 });
    expect(parte).not.toHaveProperty("id");
    expect(parte).not.toHaveProperty("atualizadoEm");
  });

  it("a lista de campos herdados é a mesma que a função copia", () => {
    const chaves = Object.keys(parteSeparadaDoLote(original)).filter((c) => c !== "quantidade");
    expect(new Set(chaves)).toEqual(new Set(CAMPOS_HERDADOS_NA_DIVISAO));
  });
});
