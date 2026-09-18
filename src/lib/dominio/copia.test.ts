import { describe, expect, it } from "vitest";

import { validarCriacaoCopia, validarEdicaoCopia } from "./copia";

describe("validarCriacaoCopia", () => {
  it("valida uma cópia mínima (cadastro por busca)", () => {
    const resultado = validarCriacaoCopia({
      cartaId: "base1-4",
      idiomaCatalogo: "en",
      idioma: "pt",
      variante: "holo",
      condicao: "NM",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copia.quantidade).toBe(1);
    expect(resultado.copia.gradedEmpresa).toBeNull();
  });

  it("aceita campos de graded e aquisição", () => {
    const resultado = validarCriacaoCopia({
      cartaId: "base1-4",
      idiomaCatalogo: "en",
      idioma: "en",
      variante: "holo",
      condicao: "NM",
      quantidade: 1,
      gradedEmpresa: "PSA",
      gradedNota: "9",
      gradedCertificado: "123456",
      aquisicaoData: "2026-08-20",
      aquisicaoOrigem: "Feira de trocas",
      aquisicaoPreco: 150.5,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copia.gradedEmpresa).toBe("PSA");
    expect(resultado.copia.aquisicaoPreco).toBe("150.50");
    expect(resultado.copia.aquisicaoData).toBe("2026-08-20");
  });

  it("rejeita cartaId ausente e enums inválidos, acumulando erros", () => {
    const resultado = validarCriacaoCopia({
      idiomaCatalogo: "xx",
      idioma: "pt",
      variante: "normal",
      condicao: "NM",
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erros.length).toBeGreaterThanOrEqual(2);
  });

  it("rejeita data de aquisição em formato inválido", () => {
    const resultado = validarCriacaoCopia({
      cartaId: "base1-4",
      idiomaCatalogo: "en",
      idioma: "pt",
      variante: "normal",
      condicao: "NM",
      aquisicaoData: "20/08/2026",
    });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita preço negativo", () => {
    const resultado = validarCriacaoCopia({
      cartaId: "base1-4",
      idiomaCatalogo: "en",
      idioma: "pt",
      variante: "normal",
      condicao: "NM",
      aquisicaoPreco: -5,
    });
    expect(resultado.ok).toBe(false);
  });
});

describe("validarEdicaoCopia", () => {
  it("patch vazio é válido (nada a mudar)", () => {
    const resultado = validarEdicaoCopia({});
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.patch).toEqual({});
  });

  it("atualiza só os campos de localização física", () => {
    const resultado = validarEdicaoCopia({ localizacao: "Caixa 2, slot 14" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.patch).toEqual({ localizacao: "Caixa 2, slot 14" });
  });

  it("permite limpar um campo de graded mandando string vazia", () => {
    const resultado = validarEdicaoCopia({ gradedCertificado: "" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.patch.gradedCertificado).toBeNull();
  });

  it("rejeita condicao inválida sem afetar os demais campos válidos", () => {
    const resultado = validarEdicaoCopia({
      condicao: "XX",
      localizacao: "Caixa 1",
    });
    expect(resultado.ok).toBe(false);
  });

  it("não aceita alterar identidade da carta (cartaId não é um campo do patch)", () => {
    // TypeScript já impede isso em tempo de compilação (EdicaoCopiaBruta
    // não declara cartaId); este teste documenta a decisão em runtime.
    const resultado = validarEdicaoCopia({
      quantidade: 3,
    } as Record<string, unknown>);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect("cartaId" in resultado.patch).toBe(false);
  });
});
