import { describe, expect, it } from "vitest";

import { validarCriacaoColecao, validarEdicaoColecao } from "./colecao";

describe("validarCriacaoColecao", () => {
  it("aceita coleção pokedex nacional válida", () => {
    const r = validarCriacaoColecao({
      nome: "Pokédex Nacional",
      tipo: "pokedex",
      parametro: { escopo: "nacional" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.colecao.tipo).toBe("pokedex");
      expect(r.colecao.notas).toBeNull();
      expect(r.colecao.idiomaExigido).toBeNull();
    }
  });

  it("aceita idiomaExigido válido e notas", () => {
    const r = validarCriacaoColecao({
      nome: "151 em português",
      tipo: "pokedex",
      parametro: { escopo: "regioes", regioes: ["kanto"] },
      idiomaExigido: "pt",
      notas: "  fechar em pt  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.colecao.idiomaExigido).toBe("pt");
      expect(r.colecao.notas).toBe("fechar em pt");
    }
  });

  it("rejeita nome vazio", () => {
    const r = validarCriacaoColecao({
      nome: "   ",
      tipo: "pokedex",
      parametro: { escopo: "nacional" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejeita idiomaExigido inválido", () => {
    const r = validarCriacaoColecao({
      nome: "X",
      tipo: "pokedex",
      parametro: { escopo: "nacional" },
      idiomaExigido: "fr",
    });
    expect(r.ok).toBe(false);
  });

  it("propaga erro de parâmetro estrutural inválido", () => {
    const r = validarCriacaoColecao({
      nome: "Set 151",
      tipo: "set",
      parametro: { setId: "sv03.5" }, // falta idiomaCatalogo e incluirSecretas
    });
    expect(r.ok).toBe(false);
  });

  it("acumula todos os erros de uma vez (nome + parametro)", () => {
    const r = validarCriacaoColecao({ nome: "", tipo: "set", parametro: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBeGreaterThan(1);
  });
});

describe("validarEdicaoColecao", () => {
  it("aceita patch parcial só com nome", () => {
    const r = validarEdicaoColecao({ nome: "Novo nome" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toEqual({ nome: "Novo nome" });
  });

  it("aceita limpar idiomaExigido com null", () => {
    const r = validarEdicaoColecao({ idiomaExigido: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.idiomaExigido).toBeNull();
  });

  it("aceita limpar notas com string vazia", () => {
    const r = validarEdicaoColecao({ notas: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.notas).toBeNull();
  });

  it("rejeita nome vazio", () => {
    const r = validarEdicaoColecao({ nome: "   " });
    expect(r.ok).toBe(false);
  });

  it("rejeita idiomaExigido inválido", () => {
    const r = validarEdicaoColecao({ idiomaExigido: "xx" });
    expect(r.ok).toBe(false);
  });

  it("patch vazio quando nada é enviado", () => {
    const r = validarEdicaoColecao({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toEqual({});
  });

  it("recusa (não ignora) tentativa de editar o parametro estrutural", () => {
    const r = validarEdicaoColecao({
      parametro: { setId: "base1", idiomaCatalogo: "en", incluirSecretas: false },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros.some((e) => e.includes("parametro"))).toBe(true);
    }
  });

  it("recusa tentativa de editar o tipo", () => {
    const r = validarEdicaoColecao({ tipo: "pokedex" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros.some((e) => e.includes("tipo"))).toBe(true);
    }
  });

  it("recusa parametro/tipo mesmo misturado com um campo válido — não aplica nada parcialmente", () => {
    const r = validarEdicaoColecao({ nome: "Novo nome", tipo: "set" });
    expect(r.ok).toBe(false);
  });
});
