import { describe, expect, it } from "vitest";

import { contaNaTrilha, contarVagasDex, filtrarFormasDex, type FormaParaGrade } from "./dex-grade";
import { resolverSecoes } from "./dex-secoes";

const f = (numero: number, especie: string, extra: Partial<FormaParaGrade> = {}): FormaParaGrade => ({
  numero,
  especie,
  forma: null,
  categoria: "base",
  shinyObtenivel: true,
  ...extra,
});

const formas = [
  f(25, "Pikachu"),
  f(25, "Pikachu", { forma: "World Cap", categoria: "especial", shinyObtenivel: false }),
  f(26, "Raichu", { forma: "Alolan Form", categoria: "regional" }),
  f(494, "Victini", { shinyObtenivel: false }),
];

describe("contaNaTrilha", () => {
  const todas = resolverSecoes([]);

  it("forma sem shiny conta na normal e não na shiny", () => {
    expect(contaNaTrilha(formas[3], "normal", todas)).toBe(true);
    expect(contaNaTrilha(formas[3], "shiny", todas)).toBe(false);
  });

  it("seção desligada não conta em nenhuma trilha", () => {
    const semRegional = resolverSecoes([{ categoria: "regional", conta: false }]);
    expect(contaNaTrilha(formas[2], "normal", semRegional)).toBe(false);
    expect(contaNaTrilha(formas[2], "shiny", semRegional)).toBe(false);
  });
});

describe("contarVagasDex", () => {
  it("conta as duas trilhas separadas", () => {
    expect(contarVagasDex(formas, resolverSecoes([]))).toEqual({ normal: 4, shiny: 2 });
  });

  it("acompanha as seções ligadas", () => {
    const soBase = resolverSecoes([
      { categoria: "regional", conta: false },
      { categoria: "especial", conta: false },
    ]);
    expect(contarVagasDex(formas, soBase)).toEqual({ normal: 2, shiny: 1 });
  });
});

describe("filtrarFormasDex", () => {
  const sem = { regiao: "todas", categoria: "todas", busca: "" } as const;

  it("filtra por região pelo número nacional", () => {
    expect(filtrarFormasDex(formas, { ...sem, regiao: "unova" }).map((x) => x.especie)).toEqual(["Victini"]);
  });

  it("filtra por seção", () => {
    expect(filtrarFormasDex(formas, { ...sem, categoria: "regional" })).toHaveLength(1);
  });

  it("busca por número exato, com ou sem #", () => {
    expect(filtrarFormasDex(formas, { ...sem, busca: "#25" })).toHaveLength(2);
    expect(filtrarFormasDex(formas, { ...sem, busca: "2" })).toHaveLength(0);
  });

  it("busca por nome da espécie ou da forma, sem caixa nem acento", () => {
    expect(filtrarFormasDex(formas, { ...sem, busca: "rai" })).toHaveLength(1);
    expect(filtrarFormasDex(formas, { ...sem, busca: "world" })).toHaveLength(1);
  });
});
