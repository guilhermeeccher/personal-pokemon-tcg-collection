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
  it("cada região começa numa caixa nova, e só a última da região sobra", () => {
    const porRegiao = new Map<string, number[]>();
    for (const c of caixas) porRegiao.set(c.regiao, [...(porRegiao.get(c.regiao) ?? []), c.vagas.length]);
    const resumo = Object.fromEntries([...porRegiao].map(([r, tamanhos]) => [r, `${tamanhos.length}×, última ${tamanhos.at(-1)}`]));
    expect(resumo).toEqual({
      kanto: "8×, última 8",
      johto: "6×, última 6",
      hoenn: "6×, última 8",
      sinnoh: "5×, última 30",
      unova: "6×, última 30",
      kalos: "5×, última 9",
      alola: "4×, última 12",
      galar: "6×, última 17",
      paldea: "5×, última 11",
    });
    for (const tamanhos of porRegiao.values()) for (const t of tamanhos.slice(0, -1)) expect(t).toBe(VAGAS_POR_CAIXA);
  });

  /*
   * Posições conferidas em 2026-10-12 no "Fully Sorted by Regions" do
   * SuperEffective (sem as caixas de reserva vazias dele): batem vaga a vaga
   * em Kanto, Johto, Hoenn, Sinnoh, Unova, Galar e Paldea.
   */
  it("bate com o arranjo de referência nas viradas de região", () => {
    const esperado: Record<string, [number, number]> = {
      bulbasaur: [1, 1],
      pikachu: [2, 1],
      mew: [8, 8],
      chikorita: [9, 1],
      celebi: [14, 6],
      treecko: [15, 1],
      turtwig: [21, 1],
      arceus: [25, 30],
      victini: [26, 1],
      chespin: [32, 1],
      rowlet: [37, 1],
      grookey: [41, 1],
      sprigatito: [47, 1],
      pecharunt: [51, 11],
    };
    for (const [id, [caixa, posicao]] of Object.entries(esperado)) expect(pos.get(id)).toEqual({ caixa, posicao });
    expect(caixas).toHaveLength(51);
  });

  it("a ordem dentro da caixa é a do catálogo, com as cosméticas na espécie", () => {
    expect(caixas[0].vagas.slice(20, 26).map((f) => f.id)).toEqual([
      "rattata",
      "rattata-femea",
      "rattata-alola",
      "raticate",
      "raticate-femea",
      "raticate-alola",
    ]);
    expect(caixas[1].vagas.slice(0, 3).map((f) => f.id)).toEqual(["pikachu", "pikachu-femea", "pikachu-original-cap"]);
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
