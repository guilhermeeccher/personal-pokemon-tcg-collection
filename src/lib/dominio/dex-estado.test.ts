import { describe, expect, it } from "vitest";

import { resolverSecoes } from "./dex-secoes";
import { estadoDaVaga, mapearEstadosDex, progressoDex } from "./dex-estado";

const formas = [
  { id: "bulbasaur", numero: 1, especie: "Bulbasaur", forma: null, categoria: "base" as const, shinyObtenivel: true },
  { id: "venusaur-femea", numero: 3, especie: "Venusaur", forma: "Female", categoria: "genero" as const, shinyObtenivel: true },
  { id: "victini", numero: 494, especie: "Victini", forma: null, categoria: "base" as const, shinyObtenivel: false },
];

describe("estado da vaga", () => {
  it("sem registro, falta nas duas trilhas", () => {
    const mapa = mapearEstadosDex([]);
    expect(estadoDaVaga(mapa, "bulbasaur", "normal")).toBe("falta");
    expect(estadoDaVaga(mapa, "bulbasaur", "shiny")).toBe("falta");
  });

  it("registro num jogo deixa a vaga 'no jogo'; um no HOME vence, em qualquer ordem", () => {
    const a = mapearEstadosDex([
      { formaId: "bulbasaur", shiny: false, local: "firered" },
      { formaId: "bulbasaur", shiny: false, local: "home" },
    ]);
    const b = mapearEstadosDex([
      { formaId: "bulbasaur", shiny: false, local: "home" },
      { formaId: "bulbasaur", shiny: false, local: "firered" },
    ]);
    expect(estadoDaVaga(a, "bulbasaur", "normal")).toBe("no_home");
    expect(estadoDaVaga(b, "bulbasaur", "normal")).toBe("no_home");
  });

  it("um shiny preenche só a trilha shiny", () => {
    const mapa = mapearEstadosDex([{ formaId: "bulbasaur", shiny: true, local: "home" }]);
    expect(estadoDaVaga(mapa, "bulbasaur", "shiny")).toBe("no_home");
    expect(estadoDaVaga(mapa, "bulbasaur", "normal")).toBe("falta");
  });
});

describe("progressoDex", () => {
  it("conta só vaga que conta: forma sem shiny sai do total shiny, seção desligada sai dos dois", () => {
    const mapa = mapearEstadosDex([
      { formaId: "bulbasaur", shiny: false, local: "home" },
      { formaId: "venusaur-femea", shiny: false, local: "brilliant-diamond" },
    ]);
    expect(progressoDex(formas, mapa, resolverSecoes([]))).toEqual({
      normal: { contam: 3, noHome: 1, noJogo: 1 },
      shiny: { contam: 2, noHome: 0, noJogo: 0 },
    });
    const semGenero = resolverSecoes([{ categoria: "genero", conta: false }]);
    expect(progressoDex(formas, mapa, semGenero).normal).toEqual({ contam: 2, noHome: 1, noJogo: 0 });
  });
});
