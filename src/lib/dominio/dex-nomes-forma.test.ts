import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { filtrarFormasDex, formasComFemea, rotuloDaForma } from "./dex-grade";
import { FORMAS_SEM_NOME_PT, NOMES_FORMA_PT, nomeDaFormaPt } from "./dex-nomes-forma";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

/* O catálogo de vagas real (`seed/dex-forma.csv`, versionado, sem dado de coleção). */
const vagas = lerRegistrosCsv(
  fs.readFileSync(path.resolve(__dirname, "../../../seed/dex-forma.csv"), "utf8"),
  COLUNAS_DEX_FORMA,
).map(converterLinhaDexForma);

describe("nome da forma em português — o seed", () => {
  it("toda vaga com nome tem regra: nome oficial ou inglês declarado", () => {
    const semRegra = vagas.filter((v) => v.forma !== null && nomeDaFormaPt(v.forma ?? null) === undefined);
    expect(semRegra.map((v) => v.id)).toEqual([]);
  });

  it("o forma_pt do arquivo é o que a tabela dá hoje (o seed não ficou para trás)", () => {
    const fora = vagas.filter((v) => (nomeDaFormaPt(v.forma ?? null) ?? null) !== (v.formaPt ?? null));
    expect(fora.map((v) => v.id)).toEqual([]);
  });

  it("nenhuma entrada da tabela sobra: cada uma nomeia ao menos uma vaga", () => {
    const nomes = new Set(vagas.map((v) => v.forma));
    const sobrando = [...Object.keys(NOMES_FORMA_PT), ...FORMAS_SEM_NOME_PT].filter((n) => !nomes.has(n));
    expect(sobrando).toEqual([]);
  });

  it("uma forma não está nas duas listas", () => {
    expect([...FORMAS_SEM_NOME_PT].filter((n) => n in NOMES_FORMA_PT)).toEqual([]);
  });

  it("os casos de referência", () => {
    const pt = (id: string) => vagas.find((v) => v.id === id)?.formaPt;
    expect(pt("vivillon-polar")).toBe("Padrão Polar");
    expect(pt("raichu-alola")).toBe("Forma de Alola");
    expect(pt("tauros-paldea-aqua-breed")).toBe("Forma de Paldea (Espécie Aquática)");
    expect(pt("sneasel-hisui-femea")).toBe("Forma de Hisui");
    expect(pt("gourgeist-super")).toBe("Tamanho Extragrande");
    expect(pt("ogerpon")).toBe("Máscara Turquesa");
    expect(pt("pikachu-world-cap")).toBeNull();
    expect(pt("unown-b")).toBeNull();
    expect(pt("pikachu-femea")).toBeNull();
  });
});

describe("nomeDaFormaPt", () => {
  it("sem nome, gênero, Unown e Alcremie ficam nulos", () => {
    expect(nomeDaFormaPt(null)).toBeNull();
    expect(nomeDaFormaPt("Female")).toBeNull();
    expect(nomeDaFormaPt("?")).toBeNull();
    expect(nomeDaFormaPt("Vanilla Cream Strawberry Sweet")).toBeNull();
  });

  it("forma que nenhuma regra conhece é undefined, e o gerador falha", () => {
    expect(nomeDaFormaPt("Brand New Form")).toBeUndefined();
  });
});

describe("rótulo e busca com o nome em português", () => {
  const formas = [
    { id: "vivillon-polar", numero: 666, especie: "Vivillon", forma: "Polar Pattern", formaPt: "Padrão Polar", categoria: "cosmetica" as const, shinyObtenivel: true },
    { id: "pikachu-world-cap", numero: 25, especie: "Pikachu", forma: "World Cap", formaPt: null, categoria: "cosmetica" as const, shinyObtenivel: false },
    { id: "sneasel", numero: 215, especie: "Sneasel", forma: null, formaPt: null, categoria: "base" as const, shinyObtenivel: true },
    { id: "sneasel-hisui", numero: 215, especie: "Sneasel", forma: "Hisuian Form", formaPt: "Forma de Hisui", categoria: "regional" as const, shinyObtenivel: true },
    { id: "sneasel-hisui-femea", numero: 215, especie: "Sneasel", forma: "Hisuian Form (Female)", formaPt: "Forma de Hisui", categoria: "genero" as const, shinyObtenivel: true },
  ];
  const comFemea = formasComFemea(formas);
  const pt = { macho: "Macho", femea: "Fêmea", portugues: true };
  const en = { macho: "Male", femea: "Female", portugues: false };
  const rotulo = (id: string, r: typeof pt) => rotuloDaForma(formas.find((f) => f.id === id)!, comFemea, r);

  it("em português mostra o nome oficial; sem ele, o inglês", () => {
    expect(rotulo("vivillon-polar", pt)).toBe("Padrão Polar");
    expect(rotulo("pikachu-world-cap", pt)).toBe("World Cap");
  });

  it("em inglês mostra sempre o inglês", () => {
    expect(rotulo("vivillon-polar", en)).toBe("Polar Pattern");
  });

  it("o par de gênero junta o nome da forma e o rótulo da interface", () => {
    expect(rotulo("sneasel-hisui", pt)).toBe("Forma de Hisui · Macho");
    expect(rotulo("sneasel-hisui-femea", pt)).toBe("Forma de Hisui · Fêmea");
    expect(rotulo("sneasel-hisui-femea", en)).toBe("Hisuian Form · Female");
  });

  it("a busca acha pelos dois nomes, sem acento", () => {
    const busca = (texto: string) =>
      filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca: texto }).map((f) => f.id);
    expect(busca("padrao polar")).toEqual(["vivillon-polar"]);
    expect(busca("polar pattern")).toEqual(["vivillon-polar"]);
    expect(busca("hisui")).toEqual(["sneasel-hisui", "sneasel-hisui-femea"]);
  });
});
