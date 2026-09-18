import { describe, expect, it } from "vitest";

import { validarFiltrosRepetidas } from "./filtros-repetidas";

describe("validarFiltrosRepetidas", () => {
  it("sem filtros retorna defaults (soLivres false, página 1, tamanho 50)", () => {
    const resultado = validarFiltrosRepetidas({});
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros).toEqual({ soLivres: false, pagina: 1, tamanhoPagina: 50 });
  });

  it("aceita soLivres=true", () => {
    const resultado = validarFiltrosRepetidas({ soLivres: "true" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros.soLivres).toBe(true);
  });

  it("aceita paginação customizada", () => {
    const resultado = validarFiltrosRepetidas({ pagina: "3", tamanhoPagina: "20" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros.pagina).toBe(3);
    expect(resultado.filtros.tamanhoPagina).toBe(20);
  });

  it("rejeita soLivres inválido", () => {
    const resultado = validarFiltrosRepetidas({ soLivres: "talvez" });
    expect(resultado.ok).toBe(false);
  });

  it("rejeita página não inteira ou menor que 1", () => {
    expect(validarFiltrosRepetidas({ pagina: "0" }).ok).toBe(false);
    expect(validarFiltrosRepetidas({ pagina: "1.5" }).ok).toBe(false);
    expect(validarFiltrosRepetidas({ pagina: "abc" }).ok).toBe(false);
  });

  it("rejeita tamanhoPagina fora do intervalo 1-200", () => {
    expect(validarFiltrosRepetidas({ tamanhoPagina: "0" }).ok).toBe(false);
    expect(validarFiltrosRepetidas({ tamanhoPagina: "201" }).ok).toBe(false);
  });

  it("ignora string vazia como se ausente", () => {
    const resultado = validarFiltrosRepetidas({ soLivres: "", pagina: "" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.filtros).toEqual({ soLivres: false, pagina: 1, tamanhoPagina: 50 });
  });
});
