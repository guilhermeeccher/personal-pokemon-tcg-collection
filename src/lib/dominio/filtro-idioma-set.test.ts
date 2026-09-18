import { describe, expect, it } from "vitest";

import {
  FILTRO_IDIOMA_TODOS,
  derivarOpcoesFiltroIdioma,
  derivarOpcoesFiltroIdiomaComContagem,
  filtrarSetsPorIdioma,
  rotuloFiltroIdioma,
} from "./filtro-idioma-set";

const MEW = { setId: "mew", idiomasDisponiveis: ["pt", "en"] as const };
const MFB = { setId: "mfb", idiomasDisponiveis: ["en"] as const };
const BASE1 = { setId: "base1", idiomasDisponiveis: ["en"] as const };

describe("filtrarSetsPorIdioma", () => {
  it("'todos' (padrão) não filtra nada", () => {
    const sets = [MEW, MFB, BASE1];
    expect(filtrarSetsPorIdioma(sets, FILTRO_IDIOMA_TODOS)).toEqual(sets);
  });

  it("'pt' mantém só sets com linha pt no catálogo", () => {
    const sets = [MEW, MFB, BASE1];
    expect(filtrarSetsPorIdioma(sets, "pt")).toEqual([MEW]);
  });

  it("'en' mantém sets com linha en, inclusive os que também têm pt", () => {
    const sets = [MEW, MFB, BASE1];
    expect(filtrarSetsPorIdioma(sets, "en")).toEqual([MEW, MFB, BASE1]);
  });

  it("idioma sem nenhum set no catálogo devolve lista vazia (não quebra)", () => {
    const sets = [MEW, MFB, BASE1];
    expect(filtrarSetsPorIdioma(sets, "jp")).toEqual([]);
  });

  it("lista vazia de entrada devolve lista vazia", () => {
    expect(filtrarSetsPorIdioma([], "pt")).toEqual([]);
  });
});

describe("derivarOpcoesFiltroIdioma", () => {
  it("deriva as opções presentes nos dados, na ordem canônica pt/en/jp", () => {
    const sets = [MEW, MFB, BASE1];
    expect(derivarOpcoesFiltroIdioma(sets)).toEqual(["pt", "en"]);
  });

  it("nunca inclui 'jp' enquanto nenhum set tiver essa linha — preparado, não inventado", () => {
    const sets = [MEW, MFB, BASE1];
    expect(derivarOpcoesFiltroIdioma(sets)).not.toContain("jp");
  });

  it("quando um set jp existir, a opção aparece sozinha, sem mudar a lógica", () => {
    const sets = [MEW, MFB, { setId: "jp-set", idiomasDisponiveis: ["jp"] as const }];
    expect(derivarOpcoesFiltroIdioma(sets)).toEqual(["pt", "en", "jp"]);
  });

  it("lista vazia de sets não deriva nenhuma opção", () => {
    expect(derivarOpcoesFiltroIdioma([])).toEqual([]);
  });
});

describe("derivarOpcoesFiltroIdiomaComContagem", () => {
  it("contagem por opção bate com o real (achado do coordenador: Todos e Inglês empatados)", () => {
    const sets = [MEW, MFB, BASE1]; // MEW: pt+en; MFB e BASE1: só en
    const opcoes = derivarOpcoesFiltroIdiomaComContagem(sets);
    expect(opcoes).toEqual([
      { filtro: FILTRO_IDIOMA_TODOS, rotulo: "Todos", quantidade: 3 },
      { filtro: "pt", rotulo: "Português", quantidade: 1 },
      { filtro: "en", rotulo: "Inglês", quantidade: 3 },
    ]);
  });

  it("contagem é sobre o conjunto completo passado — quem filtra por busca de texto filtra ANTES de chamar isto", () => {
    // Não há parâmetro de busca aqui de propósito: a contagem nunca pode
    // reagir a texto digitado, então a função nem aceita esse dado.
    const sets = [MEW, MFB, BASE1];
    const opcoes = derivarOpcoesFiltroIdiomaComContagem(sets);
    const todos = opcoes.find((o) => o.filtro === FILTRO_IDIOMA_TODOS);
    expect(todos?.quantidade).toBe(sets.length);
  });

  it("sem nenhum set, só 'Todos' aparece, com quantidade 0", () => {
    expect(derivarOpcoesFiltroIdiomaComContagem([])).toEqual([
      { filtro: FILTRO_IDIOMA_TODOS, rotulo: "Todos", quantidade: 0 },
    ]);
  });
});

describe("rotuloFiltroIdioma", () => {
  it("rotula 'todos' como 'Todos'", () => {
    expect(rotuloFiltroIdioma(FILTRO_IDIOMA_TODOS)).toBe("Todos");
  });

  it("rotula pt/en/jp em português", () => {
    expect(rotuloFiltroIdioma("pt")).toBe("Português");
    expect(rotuloFiltroIdioma("en")).toBe("Inglês");
    expect(rotuloFiltroIdioma("jp")).toBe("Japonês");
  });
});
