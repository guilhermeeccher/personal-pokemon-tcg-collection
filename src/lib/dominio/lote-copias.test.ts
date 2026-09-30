import { describe, expect, it } from "vitest";

import { validarLoteCopias } from "./lote-copias";

describe("validarLoteCopias", () => {
  it("critério de aceite: valida a grade inteira de um set em uma única chamada", () => {
    const resultado = validarLoteCopias({
      idiomaCatalogo: "pt",
      itens: [
        {
          cartaId: "sv03.5-001",
          quantidade: 1,
          variante: "normal",
          idioma: "pt",
          condicao: "NM",
        },
        {
          cartaId: "sv03.5-002",
          quantidade: 2,
          variante: "holo",
          idioma: "en",
          condicao: "LP",
          localizacao: "Fichário 1, pág. 3",
        },
      ],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copias).toHaveLength(2);
    expect(resultado.copias[0]).toEqual({
      cartaId: "sv03.5-001",
      idiomaCatalogo: "pt",
      idioma: "pt",
      variante: "normal",
      quantidade: 1,
      condicao: "NM",
      localizacao: null,
    });
    expect(resultado.copias[1].localizacao).toBe("Fichário 1, pág. 3");
  });

  it("caso base1 (regra 7): idiomaCatalogo en, idioma físico pt, sem erro", () => {
    const resultado = validarLoteCopias({
      idiomaCatalogo: "en",
      itens: [
        {
          cartaId: "base1-4",
          quantidade: 1,
          variante: "holo",
          idioma: "pt",
          condicao: "NM",
        },
      ],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copias[0].idiomaCatalogo).toBe("en");
    expect(resultado.copias[0].idioma).toBe("pt");
  });

  it("aceita idiomaCatalogo por item, num lote que mistura fichas pt e en", () => {
    // Caso real (2026-09-30): o 30th tinha 2 cartas com ficha pt e o resto
    // só com a en; a mesma grade grava as duas.
    const resultado = validarLoteCopias({
      itens: [
        { cartaId: "30th-001", idiomaCatalogo: "pt", quantidade: 1, variante: "normal", idioma: "pt", condicao: "NM" },
        { cartaId: "30th-050", idiomaCatalogo: "en", quantidade: 1, variante: "holo", idioma: "pt", condicao: "NM" },
      ],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copias.map((c) => c.idiomaCatalogo)).toEqual(["pt", "en"]);
  });

  it("o idiomaCatalogo do item vence o do lote", () => {
    const resultado = validarLoteCopias({
      idiomaCatalogo: "pt",
      itens: [
        { cartaId: "30th-050", idiomaCatalogo: "en", quantidade: 1, variante: "holo", idioma: "pt", condicao: "NM" },
      ],
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.copias[0].idiomaCatalogo).toBe("en");
  });

  it("rejeita idiomaCatalogo inválido no item", () => {
    const resultado = validarLoteCopias({
      itens: [
        { cartaId: "x-1", idiomaCatalogo: "fr", quantidade: 1, variante: "normal", idioma: "pt", condicao: "NM" },
      ],
    });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita lote vazio (nenhuma carta marcada)", () => {
    const resultado = validarLoteCopias({ idiomaCatalogo: "pt", itens: [] });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita idiomaCatalogo ausente", () => {
    const resultado = validarLoteCopias({
      itens: [
        {
          cartaId: "x-1",
          quantidade: 1,
          variante: "normal",
          idioma: "pt",
          condicao: "NM",
        },
      ],
    });
    expect(resultado.ok).toBe(false);
  });

  it("acumula erros de vários itens em vez de parar no primeiro", () => {
    const resultado = validarLoteCopias({
      idiomaCatalogo: "pt",
      itens: [
        { cartaId: "x-1", quantidade: 0, variante: "normal", idioma: "pt", condicao: "NM" },
        { cartaId: "x-2", quantidade: 1, variante: "invalida", idioma: "pt", condicao: "NM" },
      ],
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erros).toHaveLength(2);
    expect(resultado.erros.map((e) => e.cartaId)).toEqual(["x-1", "x-2"]);
  });

  it("rejeita quantidade fracionária ou negativa", () => {
    const base = {
      idiomaCatalogo: "pt" as const,
      itens: [
        { cartaId: "x-1", variante: "normal", idioma: "pt", condicao: "NM" },
      ],
    };
    expect(
      validarLoteCopias({
        ...base,
        itens: [{ ...base.itens[0], quantidade: 1.5 }],
      }).ok,
    ).toBe(false);
    expect(
      validarLoteCopias({
        ...base,
        itens: [{ ...base.itens[0], quantidade: -1 }],
      }).ok,
    ).toBe(false);
  });
});
