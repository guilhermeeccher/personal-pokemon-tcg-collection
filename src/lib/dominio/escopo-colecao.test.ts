import { describe, expect, it } from "vitest";

import {
  agruparChavesPorRegiao,
  calcularDiffEscopoPokedex,
  formatarContagemPorRegiao,
} from "./escopo-colecao";
import type { ParametroPokedex } from "./parametro-colecao";

describe("calcularDiffEscopoPokedex", () => {
  it("Kanto → Kanto+Johto: só adiciona (152..251), nada a remover", () => {
    const atual: ParametroPokedex = { escopo: "regioes", regioes: ["kanto"] };
    const alvo: ParametroPokedex = { escopo: "regioes", regioes: ["kanto", "johto"] };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaRemover).toEqual([]);
    expect(diff.chavesParaAdicionar).toHaveLength(100);
    expect(diff.chavesParaAdicionar[0]).toBe("152");
    expect(diff.chavesParaAdicionar[diff.chavesParaAdicionar.length - 1]).toBe("251");
  });

  it("Kanto+Johto → Kanto: só remove (152..251), nada a adicionar", () => {
    const atual: ParametroPokedex = { escopo: "regioes", regioes: ["kanto", "johto"] };
    const alvo: ParametroPokedex = { escopo: "regioes", regioes: ["kanto"] };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaAdicionar).toEqual([]);
    expect(diff.chavesParaRemover).toHaveLength(100);
    expect(diff.chavesParaRemover[0]).toBe("152");
  });

  it("regiões → nacional: adiciona tudo que faltava, nunca remove o que já tem", () => {
    const atual: ParametroPokedex = { escopo: "regioes", regioes: ["kanto"] };
    const alvo: ParametroPokedex = { escopo: "nacional" };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaRemover).toEqual([]);
    expect(diff.chavesParaAdicionar).toHaveLength(1025 - 151);
    expect(diff.chavesParaAdicionar[0]).toBe("152");
    expect(diff.chavesParaAdicionar[diff.chavesParaAdicionar.length - 1]).toBe("1025");
  });

  it("nacional → regiões: remove tudo que ficou fora do novo conjunto", () => {
    const atual: ParametroPokedex = { escopo: "nacional" };
    const alvo: ParametroPokedex = { escopo: "regioes", regioes: ["kanto", "johto"] };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaAdicionar).toEqual([]);
    expect(diff.chavesParaRemover).toHaveLength(1025 - 251);
    expect(diff.chavesParaRemover[0]).toBe("252");
  });

  it("mesmo escopo: diff vazio dos dois lados (no-op)", () => {
    const parametro: ParametroPokedex = { escopo: "regioes", regioes: ["kanto", "johto"] };
    const diff = calcularDiffEscopoPokedex(parametro, {
      escopo: "regioes",
      regioes: ["kanto", "johto"],
    });
    expect(diff.chavesParaAdicionar).toEqual([]);
    expect(diff.chavesParaRemover).toEqual([]);
  });

  it("regiões representadas com listas em ordem diferente não geram diff espúrio", () => {
    const atual: ParametroPokedex = { escopo: "regioes", regioes: ["kanto", "johto"] };
    const alvo: ParametroPokedex = { escopo: "regioes", regioes: ["johto", "kanto"] };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaAdicionar).toEqual([]);
    expect(diff.chavesParaRemover).toEqual([]);
  });

  it("todas as regiões listadas equivale a nacional: sem diff contra nacional", () => {
    const todas: ParametroPokedex = {
      escopo: "regioes",
      regioes: [
        "kanto",
        "johto",
        "hoenn",
        "sinnoh",
        "unova",
        "kalos",
        "alola",
        "galar",
        "paldea",
      ],
    };
    const diff = calcularDiffEscopoPokedex({ escopo: "nacional" }, todas);
    expect(diff.chavesParaAdicionar).toEqual([]);
    expect(diff.chavesParaRemover).toEqual([]);
  });

  it("troca de regiões não-sobrepostas: adiciona a nova, remove a antiga", () => {
    const atual: ParametroPokedex = { escopo: "regioes", regioes: ["kanto"] };
    const alvo: ParametroPokedex = { escopo: "regioes", regioes: ["paldea"] };
    const diff = calcularDiffEscopoPokedex(atual, alvo);
    expect(diff.chavesParaRemover).toHaveLength(151);
    expect(diff.chavesParaAdicionar).toHaveLength(120);
    expect(diff.chavesParaAdicionar[0]).toBe("906");
  });
});

describe("agruparChavesPorRegiao", () => {
  it("agrupa e conta por região, na ordem Kanto → Paldea", () => {
    const contagens = agruparChavesPorRegiao(["200", "201", "1", "160"]);
    expect(contagens).toEqual([
      { regiao: "kanto", quantidade: 1 },
      { regiao: "johto", quantidade: 3 },
    ]);
  });

  it("lista vazia devolve array vazio", () => {
    expect(agruparChavesPorRegiao([])).toEqual([]);
  });

  it("uma única chave devolve um único grupo com quantidade 1", () => {
    expect(agruparChavesPorRegiao(["906"])).toEqual([{ regiao: "paldea", quantidade: 1 }]);
  });
});

describe("formatarContagemPorRegiao", () => {
  it("formata múltiplas regiões separadas por vírgula", () => {
    const texto = formatarContagemPorRegiao([
      { regiao: "kanto", quantidade: 1 },
      { regiao: "johto", quantidade: 3 },
    ]);
    expect(texto).toBe("kanto (1), johto (3)");
  });

  it("lista vazia formata como string vazia", () => {
    expect(formatarContagemPorRegiao([])).toBe("");
  });
});
