import { describe, expect, it } from "vitest";

import { validarFiltrosInventario } from "./filtros-inventario";

describe("validarFiltrosInventario", () => {
  it("sem filtros retorna defaults de paginação e nada mais setado", () => {
    const resultado = validarFiltrosInventario({});
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros).toEqual({ pagina: 1, tamanhoPagina: 50 });
  });

  it("combina três ou mais filtros simultaneamente (critério de aceite)", () => {
    const resultado = validarFiltrosInventario({
      set: "sv03.5",
      idioma: "pt",
      condicao: "NM",
      alocacao: "livre",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros.setId).toBe("sv03.5");
    expect(resultado.filtros.idioma).toBe("pt");
    expect(resultado.filtros.condicao).toBe("NM");
    expect(resultado.filtros.alocada).toBe(false);
  });

  it("aceita todos os filtros previstos na spec ao mesmo tempo", () => {
    const resultado = validarFiltrosInventario({
      set: "base1",
      idioma: "en",
      raridade: "Rare Holo",
      variante: "holo",
      condicao: "LP",
      graded: "true",
      localizacao: "Fichário",
      alocacao: "alocada",
      q: "Charizard",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros).toMatchObject({
      setId: "base1",
      idioma: "en",
      raridade: "Rare Holo",
      variante: "holo",
      condicao: "LP",
      graded: true,
      localizacao: "Fichário",
      alocada: true,
      q: "Charizard",
    });
  });

  it("rejeita valor de enum inválido", () => {
    expect(validarFiltrosInventario({ idioma: "fr" }).ok).toBe(false);
    expect(validarFiltrosInventario({ condicao: "PERFEITA" }).ok).toBe(false);
    expect(validarFiltrosInventario({ alocacao: "talvez" }).ok).toBe(false);
  });

  it("valida paginação", () => {
    expect(validarFiltrosInventario({ pagina: "0" }).ok).toBe(false);
    expect(validarFiltrosInventario({ tamanhoPagina: "500" }).ok).toBe(false);
    const ok = validarFiltrosInventario({ pagina: "2", tamanhoPagina: "20" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error("esperava ok");
    expect(ok.filtros.pagina).toBe(2);
    expect(ok.filtros.tamanhoPagina).toBe(20);
  });
});

describe("filtro de imagem faltando", () => {
  it("aceita semImagem=true", () => {
    const r = validarFiltrosInventario({ semImagem: "true" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filtros.semImagem).toBe(true);
  });

  it("trata semImagem=false como ausência de filtro", () => {
    // Não existe "só as que têm imagem" — seria um caso que ninguém pediu.
    const r = validarFiltrosInventario({ semImagem: "false" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filtros.semImagem).toBeUndefined();
  });

  it("recusa valor inválido em vez de ignorar em silêncio", () => {
    const r = validarFiltrosInventario({ semImagem: "talvez" });
    expect(r.ok).toBe(false);
  });

  it("sem o parâmetro, não filtra", () => {
    const r = validarFiltrosInventario({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filtros.semImagem).toBeUndefined();
  });
});
