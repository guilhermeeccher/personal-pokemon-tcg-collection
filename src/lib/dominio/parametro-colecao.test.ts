import { describe, expect, it } from "vitest";

import { validarParametroColecao } from "./parametro-colecao";

describe("validarParametroColecao — pokedex", () => {
  it("aceita escopo nacional", () => {
    const r = validarParametroColecao("pokedex", { escopo: "nacional" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado).toEqual({ tipo: "pokedex", parametro: { escopo: "nacional" } });
  });

  it("aceita escopo regioes com uma ou mais regiões válidas", () => {
    const r = validarParametroColecao("pokedex", {
      escopo: "regioes",
      regioes: ["kanto", "johto"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado).toEqual({
        tipo: "pokedex",
        parametro: { escopo: "regioes", regioes: ["kanto", "johto"] },
      });
    }
  });

  it("rejeita escopo regioes sem lista de regiões", () => {
    const r = validarParametroColecao("pokedex", { escopo: "regioes" });
    expect(r.ok).toBe(false);
  });

  it("rejeita escopo regioes com região inválida", () => {
    const r = validarParametroColecao("pokedex", {
      escopo: "regioes",
      regioes: ["orre"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejeita escopo desconhecido", () => {
    const r = validarParametroColecao("pokedex", { escopo: "mundial" });
    expect(r.ok).toBe(false);
  });

  it("rejeita parametro ausente", () => {
    const r = validarParametroColecao("pokedex", undefined);
    expect(r.ok).toBe(false);
  });
});

describe("validarParametroColecao — set", () => {
  it("aceita setId, idiomaCatalogo e incluirSecretas válidos", () => {
    const r = validarParametroColecao("set", {
      setId: "sv03.5",
      idiomaCatalogo: "en",
      incluirSecretas: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado).toEqual({
        tipo: "set",
        parametro: { setId: "sv03.5", idiomaCatalogo: "en", incluirSecretas: true },
      });
    }
  });

  it("rejeita setId ausente", () => {
    const r = validarParametroColecao("set", {
      idiomaCatalogo: "en",
      incluirSecretas: false,
    });
    expect(r.ok).toBe(false);
  });

  it("aceita idiomaCatalogo jp", () => {
    // Este teste exigia o contrário até 2026-08-26, quando o catálogo só
    // tinha pt e en. Com a entrada do japonês, recusar `jp` impediria
    // criar coleção de set exclusivo do Japão — 116 deles, incluindo o
    // SM3H do Charmander usado como caso real.
    const r = validarParametroColecao("set", {
      setId: "SM3H",
      idiomaCatalogo: "jp",
      incluirSecretas: false,
    });
    expect(r.ok).toBe(true);
  });

  it("rejeita idiomaCatalogo que não é idioma de catálogo", () => {
    const r = validarParametroColecao("set", {
      setId: "sv03.5",
      idiomaCatalogo: "fr",
      incluirSecretas: false,
    });
    expect(r.ok).toBe(false);
  });

  it("rejeita incluirSecretas não-booleano", () => {
    const r = validarParametroColecao("set", {
      setId: "sv03.5",
      idiomaCatalogo: "en",
      incluirSecretas: "sim",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validarParametroColecao — customizada", () => {
  it("aceita parametro ausente", () => {
    const r = validarParametroColecao("customizada", undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado).toEqual({ tipo: "customizada", parametro: null });
  });

  it("aceita parametro null ou objeto vazio", () => {
    expect(validarParametroColecao("customizada", null).ok).toBe(true);
    expect(validarParametroColecao("customizada", {}).ok).toBe(true);
  });

  it("rejeita parametro não-vazio", () => {
    const r = validarParametroColecao("customizada", { escopo: "nacional" });
    expect(r.ok).toBe(false);
  });
});

describe("validarParametroColecao — tipo inválido", () => {
  it("rejeita tipo desconhecido", () => {
    const r = validarParametroColecao("dex", {});
    expect(r.ok).toBe(false);
  });
});
