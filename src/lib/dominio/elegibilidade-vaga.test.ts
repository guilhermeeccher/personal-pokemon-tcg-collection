import { describe, expect, it } from "vitest";

import {
  avaliarElegibilidade,
  ehForaDePadrao,
  pertenceAoUniversoDaVaga,
} from "./elegibilidade-vaga";

describe("pertenceAoUniversoDaVaga — pokedex", () => {
  it("recusa carta sem dexId (Treinador/Energia)", () => {
    const r = pertenceAoUniversoDaVaga(
      { tipo: "pokedex", chave: "26", parametro: { escopo: "nacional" }, idiomaExigido: null },
      { setId: "base1", localId: "91", dexIds: [] },
    );
    expect(r.ok).toBe(false);
  });

  it("recusa tag team / carta multi-Pokémon, sem exceção", () => {
    const r = pertenceAoUniversoDaVaga(
      { tipo: "pokedex", chave: "25", parametro: { escopo: "nacional" }, idiomaExigido: null },
      { setId: "sv1", localId: "1", dexIds: [25, 133] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/mais de um número de Pokédex/);
  });

  it("recusa carta com dexId único mas diferente do número da vaga", () => {
    const r = pertenceAoUniversoDaVaga(
      { tipo: "pokedex", chave: "26", parametro: { escopo: "nacional" }, idiomaExigido: null },
      { setId: "base1", localId: "58", dexIds: [25] },
    );
    expect(r.ok).toBe(false);
  });

  it("aceita carta com dexId único igual à chave da vaga", () => {
    const r = pertenceAoUniversoDaVaga(
      { tipo: "pokedex", chave: "26", parametro: { escopo: "nacional" }, idiomaExigido: null },
      { setId: "base1", localId: "14", dexIds: [26] },
    );
    expect(r.ok).toBe(true);
  });

  it("regra 3 — forma nunca desdobra a vaga: Raichu de Alola e Raichu disputam a vaga 26", () => {
    const vaga = { tipo: "pokedex" as const, chave: "26", parametro: { escopo: "nacional" as const }, idiomaExigido: null };
    // Raichu "normal" — dexIds=[26], nenhuma informação de forma é
    // sequer aceita como entrada por este módulo.
    const raichu = pertenceAoUniversoDaVaga(vaga, { setId: "base1", localId: "14", dexIds: [26] });
    // Raichu de Alola — mesma vaga, mesmo dexId.
    const raichuAlola = pertenceAoUniversoDaVaga(vaga, { setId: "sm1", localId: "50", dexIds: [26] });
    expect(raichu.ok).toBe(true);
    expect(raichuAlola.ok).toBe(true);
  });
});

describe("pertenceAoUniversoDaVaga — set", () => {
  const vagaSet = {
    tipo: "set" as const,
    chave: "025",
    parametro: { setId: "sv03.5", idiomaCatalogo: "pt" as const, incluirSecretas: false },
    idiomaExigido: null,
  };

  it("aceita carta do mesmo set e local_id, case por identidade — idioma de catálogo da vaga é irrelevante aqui", () => {
    // Simula uma cópia identificada pela linha `en` do catálogo: o
    // parametro.idiomaCatalogo da vaga é 'pt', mas a função nem recebe
    // esse dado da cópia — só setId/localId, que são idioma-invariantes
    // (regra 7 do AGENTS.md).
    const r = pertenceAoUniversoDaVaga(vagaSet, { setId: "sv03.5", localId: "025", dexIds: [] });
    expect(r.ok).toBe(true);
  });

  it("recusa carta de outro set", () => {
    const r = pertenceAoUniversoDaVaga(vagaSet, { setId: "base1", localId: "025", dexIds: [] });
    expect(r.ok).toBe(false);
  });

  it("recusa carta do mesmo set mas outro local_id", () => {
    const r = pertenceAoUniversoDaVaga(vagaSet, { setId: "sv03.5", localId: "026", dexIds: [] });
    expect(r.ok).toBe(false);
  });
});

describe("pertenceAoUniversoDaVaga — customizada", () => {
  it("qualquer cópia serve, sem universo fixo", () => {
    const vaga = { tipo: "customizada" as const, chave: "1", parametro: null, idiomaExigido: null };
    const r = pertenceAoUniversoDaVaga(vaga, { setId: "qualquer", localId: "x", dexIds: [1, 2, 3] });
    expect(r.ok).toBe(true);
  });
});

describe("ehForaDePadrao", () => {
  it("null idiomaExigido nunca é fora de padrão", () => {
    expect(ehForaDePadrao(null, "en")).toBe(false);
  });
  it("mesmo idioma não é fora de padrão", () => {
    expect(ehForaDePadrao("pt", "pt")).toBe(false);
  });
  it("idioma físico diferente do exigido é fora de padrão", () => {
    expect(ehForaDePadrao("pt", "en")).toBe(true);
  });
});

describe("avaliarElegibilidade", () => {
  const vagaPokedex = { tipo: "pokedex" as const, chave: "26", parametro: { escopo: "nacional" as const }, idiomaExigido: "pt" as const };
  const cartaRaichu = { setId: "base1", localId: "14", dexIds: [26] };

  it("recusa fora de universo independente do idioma exigido", () => {
    const r = avaliarElegibilidade(
      { ...vagaPokedex, idiomaExigido: null },
      { setId: "sv1", localId: "1", dexIds: [25, 133] },
      { idioma: "pt" },
    );
    expect(r.elegivel).toBe(false);
  });

  it("recusa cópia fora do idiomaExigido sem permitirForaDePadrao", () => {
    const r = avaliarElegibilidade(vagaPokedex, cartaRaichu, { idioma: "en" });
    expect(r.elegivel).toBe(false);
  });

  it("aceita cópia fora do idiomaExigido com permitirForaDePadrao, marcada foraDePadrao", () => {
    const r = avaliarElegibilidade(vagaPokedex, cartaRaichu, { idioma: "en" }, { permitirForaDePadrao: true });
    expect(r).toEqual({ elegivel: true, foraDePadrao: true });
  });

  it("aceita cópia no idioma exigido, sem marca de fora de padrão", () => {
    const r = avaliarElegibilidade(vagaPokedex, cartaRaichu, { idioma: "pt" });
    expect(r).toEqual({ elegivel: true, foraDePadrao: false });
  });

  it("sem idiomaExigido, aceita qualquer idioma físico sem marca", () => {
    const r = avaliarElegibilidade({ ...vagaPokedex, idiomaExigido: null }, cartaRaichu, { idioma: "en" });
    expect(r).toEqual({ elegivel: true, foraDePadrao: false });
  });
});
