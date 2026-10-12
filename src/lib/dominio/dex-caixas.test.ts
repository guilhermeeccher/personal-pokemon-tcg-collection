import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { montarCaixasDex, posicoesNasCaixas, VAGAS_POR_CAIXA } from "./dex-caixas";
import { resolverSecoes } from "./dex-secoes";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

/* O catálogo de vagas real (`seed/dex-forma.csv`, versionado, sem dado de coleção). */
const formas = lerRegistrosCsv(
  fs.readFileSync(path.resolve(__dirname, "../../../seed/dex-forma.csv"), "utf8"),
  COLUNAS_DEX_FORMA,
).map((linha) => ({ ...converterLinhaDexForma(linha), shinyObtenivel: linha.shiny_obtenivel === "t" }));

const todas = resolverSecoes([]);
const caixas = montarCaixasDex(formas, "normal", todas);
const pos = posicoesNasCaixas(caixas);

describe("caixas do HOME", () => {
  it("principais por região, cada uma começando numa caixa nova; cosméticas corridas no fim", () => {
    const grupos = new Map<string, number[]>();
    for (const c of caixas) {
      const g = c.regiao ?? "cosmeticas";
      grupos.set(g, [...(grupos.get(g) ?? []), c.vagas.length]);
    }
    const resumo = Object.fromEntries([...grupos].map(([g, tamanhos]) => [g, `${tamanhos.length}×, última ${tamanhos.at(-1)}`]));
    expect(resumo).toEqual({
      kanto: "7×, última 30",
      johto: "5×, última 9",
      hoenn: "6×, última 8",
      sinnoh: "5×, última 26",
      unova: "6×, última 24",
      kalos: "3×, última 26",
      alola: "4×, última 4",
      galar: "4×, última 12",
      paldea: "5×, última 5",
      cosmeticas: "6×, última 13",
    });
    for (const tamanhos of grupos.values()) for (const t of tamanhos.slice(0, -1)) expect(t).toBe(VAGAS_POR_CAIXA);
    expect(caixas.map((c) => c.vista).lastIndexOf("principal")).toBeLessThan(caixas.map((c) => c.vista).indexOf("cosmeticas"));
  });

  /*
   * Posições fixadas em 2026-10-12, quando o usuário passou a arrumar o HOME
   * por elas. Mudar uma é mover Pokémon nas caixas dele: só com aviso.
   */
  it("as posições combinadas não mudam", () => {
    const esperado: Record<string, [number, number]> = {
      bulbasaur: [1, 1],
      pikachu: [2, 1],
      raichu: [2, 3],
      mew: [7, 30],
      chikorita: [8, 1],
      celebi: [12, 9],
      treecko: [13, 1],
      turtwig: [19, 1],
      arceus: [23, 26],
      victini: [24, 1],
      chespin: [30, 1],
      vivillon: [30, 17],
      rowlet: [33, 1],
      grookey: [37, 1],
      sprigatito: [41, 1],
      pecharunt: [45, 5],
      "pikachu-original-cap": [46, 1],
      "unown-b": [46, 9],
      "vivillon-polar": [47, 17],
      "alcremie-ruby-swirl-star-sweet": [50, 19],
      "dudunsparce-three-segment": [51, 11],
    };
    for (const [id, [caixa, posicao]] of Object.entries(esperado)) expect(pos.get(id)).toEqual({ caixa, posicao });
    expect(caixas).toHaveLength(51);
  });

  it("a forma base fica na principal; a cosmética, nas caixas do fim", () => {
    expect(caixas[0].vagas.slice(20, 26).map((f) => f.id)).toEqual([
      "rattata",
      "rattata-femea",
      "rattata-alola",
      "raticate",
      "raticate-femea",
      "raticate-alola",
    ]);
    expect(caixas[1].vagas.slice(0, 3).map((f) => f.id)).toEqual(["pikachu", "pikachu-femea", "raichu"]);
    expect(caixas.find((c) => c.vista === "principal" && c.vagas.some((f) => f.id === "unown"))).toBeDefined();
    for (const c of caixas) for (const f of c.vagas) expect(f.categoria === "cosmetica").toBe(c.vista === "cosmeticas");
  });

  it("seção desligada sai e a região se reorganiza; as outras regiões não mudam de caixa", () => {
    const semRegional = posicoesNasCaixas(montarCaixasDex(formas, "normal", { ...todas, regional: false }));
    expect(semRegional.has("raichu-alola")).toBe(false);
    expect(semRegional.get("raticate")!.posicao).toBeLessThan(pos.get("raticate")!.posicao);
    expect(semRegional.get("chikorita")!.posicao).toBe(1);
  });

  it("na trilha shiny, forma sem shiny não ocupa lugar", () => {
    const shiny = posicoesNasCaixas(montarCaixasDex(formas, "shiny", todas));
    const semShiny = formas.filter((f) => !f.shinyObtenivel);
    expect(semShiny.length).toBeGreaterThan(0);
    for (const f of semShiny) expect(shiny.has(f.id)).toBe(false);
    expect(shiny.size).toBe(formas.length - semShiny.length);
  });
});
