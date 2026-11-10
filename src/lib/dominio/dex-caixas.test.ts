import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANCORA_GRUPO,
  ANCORA_SHINY,
  CAIXAS_HOME,
  deslocamentoDaTrilha,
  GRUPOS_CAIXA,
  grupoDaForma,
  MAX_CAIXAS_RESERVADAS,
  montarCaixasDex,
  posicoesNasCaixas,
  VAGAS_POR_CAIXA,
  type FormaParaCaixa,
} from "./dex-caixas";
import { regiaoDaForma } from "./dex-classificacao";
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

/** Caixa e posição de todo lugar, buraco incluído: o mapa inteiro. */
const mapa = (cx: ReturnType<typeof montarCaixasDex>) =>
  new Map(cx.flatMap((c) => c.lugares.map((l, i) => [l.forma.id, `${c.numero}/${i + 1}`] as const)));

/** O que cada caixa tem, sem o número: grupo, região, índice e as vagas na ordem. */
const arranjo = (cx: ReturnType<typeof montarCaixasDex>) =>
  cx.map((c) => [c.grupo, c.regiao, c.indice, c.lugares.map((l) => l.forma.id)]);

describe("caixas do HOME — os grupos", () => {
  it("cada grupo começa na âncora; as Regionais, um bloco por região em caixa nova", () => {
    const porBloco = new Map<string, typeof caixas>();
    for (const c of caixas) {
      const g = c.regiao ? `${c.grupo}:${c.regiao}` : c.grupo;
      porBloco.set(g, [...(porBloco.get(g) ?? []), c]);
    }
    const resumo = Object.fromEntries(
      [...porBloco].map(([g, cx]) => [g, `${cx[0].numero} – ${cx.at(-1)!.numero} última:${cx.at(-1)!.lugares.length}`]),
    );
    for (const cx of porBloco.values()) {
      cx.forEach((c, i) => expect(c.numero).toBe(cx[0].numero + i));
      for (const c of cx.slice(0, -1)) expect(c.lugares).toHaveLength(VAGAS_POR_CAIXA);
    }
    expect(resumo).toEqual({
      nacional: "1 – 35 última:5",
      genero: "46 – 49 última:12",
      "regional:alola": "52 – 52 última:18",
      "regional:galar": "53 – 53 última:19",
      "regional:hisui": "54 – 54 última:17",
      "regional:paldea": "55 – 55 última:4",
      especial: "60 – 61 última:9",
      cosmetica: "65 – 70 última:13",
    });
    for (const grupo of GRUPOS_CAIXA) expect(caixas.find((c) => c.grupo === grupo)!.numero).toBe(ANCORA_GRUPO[grupo]);
  });

  /*
   * A guarda das âncoras. No pior caso (todas as seções, trilha normal: a
   * shiny tem o mesmo arranjo, deslocado em bloco, então as folgas entre os
   * grupos são as mesmas nas duas), nenhum grupo pode chegar na âncora do
   * seguinte. Se este teste falhar, um grupo estourou a folga: mover as
   * âncoras é decisão de quem mantém, com aviso, porque move Pokémon nas
   * caixas de todo mundo — não se ajusta o número aqui para passar.
   */
  it("nenhum grupo invade a âncora do seguinte", () => {
    const ancoras = GRUPOS_CAIXA.map((g) => ANCORA_GRUPO[g]);
    expect(ancoras).toEqual([...ancoras].sort((a, b) => a - b));
    GRUPOS_CAIXA.forEach((grupo, i) => {
      const proxima = ancoras[i + 1];
      if (proxima === undefined) return;
      const ultima = Math.max(...caixas.filter((c) => c.grupo === grupo).map((c) => c.numero));
      expect(ultima, `${grupo} chegou na caixa ${ultima}; a âncora seguinte é ${proxima}`).toBeLessThan(proxima);
    });
  });

  /*
   * A guarda da âncora shiny, no mesmo espírito. A trilha normal no pior
   * caso (todas as seções ligadas) tem de terminar antes da `ANCORA_SHINY`;
   * as reservadas ficam de fora porque deslocam as duas trilhas juntas. Se
   * falhar, as Cosméticas normais estouraram a folga: mover a âncora shiny é
   * decisão de quem mantém, com aviso, porque move todo shiny nas caixas de
   * todo mundo — não se ajusta o número aqui para passar.
   */
  it("a trilha normal termina antes da âncora da shiny", () => {
    const ultima = Math.max(...caixas.map((c) => c.numero));
    expect(ultima, `a normal chegou na caixa ${ultima}; a shiny começa na ${ANCORA_SHINY}`).toBeLessThan(ANCORA_SHINY);
    expect(deslocamentoDaTrilha("normal")).toBe(0);
    expect(deslocamentoDaTrilha("shiny")).toBe(ANCORA_SHINY - ANCORA_GRUPO.nacional);
  });

  /*
   * E a shiny, que vem por último, tem de caber no HOME no pior caso: todas
   * as seções e o máximo de reservadas. Se falhar, o que se decide é a
   * âncora shiny ou o teto das reservadas, nunca este número.
   */
  it("a trilha shiny, com o máximo de caixas reservadas, cabe no HOME", () => {
    const shiny = montarCaixasDex(formas, "shiny", todas, MAX_CAIXAS_RESERVADAS);
    expect(shiny[0].numero).toBe(MAX_CAIXAS_RESERVADAS + ANCORA_SHINY);
    const ultima = Math.max(...shiny.map((c) => c.numero));
    expect(ultima, `a shiny chegou na caixa ${ultima}; o HOME tem ${CAIXAS_HOME}`).toBeLessThanOrEqual(CAIXAS_HOME);
  });

  it("Nacional corrido: a caixa N tem os números 30N−29 a 30N, só bases", () => {
    const bases = formas.filter((f) => f.categoria === "base");
    expect(bases).toHaveLength(1025);
    for (const f of bases) {
      expect(pos.get(f.id)).toEqual({ caixa: Math.ceil(f.numero / VAGAS_POR_CAIXA), posicao: ((f.numero - 1) % VAGAS_POR_CAIXA) + 1 });
    }
    for (const c of caixas) for (const l of c.lugares) expect(l.forma.categoria === "base").toBe(c.grupo === "nacional");
  });

  it("Especiais, Cosméticas e cada bloco regional vão por lançamento, depois número, depois catálogo", () => {
    for (const grupo of ["regional", "especial", "cosmetica"] as const) {
      const chaves = caixas.filter((c) => c.grupo === grupo);
      for (const regiao of new Set(chaves.map((c) => c.regiao))) {
        const seq = chaves.filter((c) => c.regiao === regiao).flatMap((c) => c.lugares.map((l) => l.forma));
        const ordenada = [...seq].sort((a, b) => a.lancamento - b.lancamento || a.numero - b.numero || a.ordem - b.ordem);
        expect(seq.map((f) => f.id)).toEqual(ordenada.map((f) => f.id));
      }
    }
  });

  it("toda forma regional do seed tem região; a fêmea de forma regional vai no bloco dela", () => {
    for (const f of formas.filter((x) => x.categoria === "regional")) expect(regiaoDaForma(f.id)).not.toBeNull();
    expect(grupoDaForma({ id: "sneasel-hisui-femea", categoria: "genero" })).toEqual({ grupo: "regional", regiao: "hisui" });
    expect(grupoDaForma({ id: "sneasel-femea", categoria: "genero" })).toEqual({ grupo: "genero", regiao: null });
    expect(grupoDaForma({ id: "pikachu-alola-cap", categoria: "cosmetica" })).toEqual({ grupo: "cosmetica", regiao: null });
  });

  it("forma regional sem região conhecida é recusada, nunca chutada", () => {
    const inventada = { ...formas.find((f) => f.id === "raichu-alola")!, id: "raichu-kitakami" };
    expect(() => montarCaixasDex([inventada], "normal", todas)).toThrow(/raichu-kitakami/);
  });
});

describe("caixas do HOME — as posições", () => {
  /*
   * Posições fixadas em 2026-10-16, com o arranjo por grupos. O usuário
   * arruma o HOME por elas: mudar uma é mover Pokémon nas caixas dele, só
   * com aviso.
   */
  it("as posições combinadas não mudam", () => {
    const esperado: Record<string, [number, number]> = {
      // Nacional: primeira, fronteira de caixa, última.
      bulbasaur: [1, 1],
      pikachu: [1, 25],
      raichu: [1, 26],
      nidorina: [1, 30],
      nidoqueen: [2, 1],
      mew: [6, 1],
      chikorita: [6, 2],
      victini: [17, 14],
      pecharunt: [35, 5],
      // Gênero.
      "venusaur-femea": [46, 1],
      "pikachu-femea": [46, 5],
      "basculegion-female": [49, 11],
      "oinkologne-female": [49, 12],
      // Regionais: primeira de cada bloco, e a fêmea do Sneasel de Hisui logo depois dele.
      "rattata-alola": [52, 1],
      "raichu-alola": [52, 3],
      "marowak-alola": [52, 18],
      "meowth-galar": [53, 1],
      "stunfisk-galar": [53, 19],
      "growlithe-hisui": [54, 1],
      "sneasel-hisui": [54, 7],
      "sneasel-hisui-femea": [54, 8],
      "decidueye-hisui": [54, 17],
      "tauros-paldea-combat-breed": [55, 1],
      "wooper-paldea": [55, 4],
      // Especiais.
      "deoxys-speed": [60, 1],
      "rotom-wash": [60, 7],
      "lycanroc-dusk": [60, 30],
      "toxtricity-low-key": [61, 1],
      "ursaluna-bloodmoon": [61, 9],
      // Cosméticas.
      "unown-b": [65, 1],
      "vivillon-polar": [66, 9],
      "magearna-original": [67, 30],
      "alcremie-ruby-swirl-star-sweet": [69, 19],
      "sinistcha-masterpiece": [70, 13],
    };
    for (const [id, [caixa, posicao]] of Object.entries(esperado)) expect(pos.get(id), id).toEqual({ caixa, posicao });
    expect(caixas).toHaveLength(51);
    expect(pos.size).toBe(formas.length);
  });

  it("caixas reservadas deslocam só o número, todas as âncoras juntas", () => {
    const com2 = montarCaixasDex(formas, "normal", todas, 2);
    expect(com2.map((c) => c.numero)).toEqual(caixas.map((c) => c.numero + 2));
    expect(arranjo(com2)).toEqual(arranjo(caixas));
  });

  /* As mesmas posições da normal, 90 caixas adiante (decisão de 2026-11-09). Forma sem shiny não tem posição. */
  it("as posições shiny combinadas não mudam", () => {
    const posShiny = posicoesNasCaixas(montarCaixasDex(formas, "shiny", todas));
    const esperado: Record<string, [number, number]> = {
      bulbasaur: [91, 1],
      pikachu: [91, 25],
      "venusaur-femea": [136, 1],
      "raichu-alola": [142, 3],
      "wooper-paldea": [145, 4],
      "vivillon-polar": [156, 9],
      "sinistcha-masterpiece": [160, 13],
    };
    for (const [id, [caixa, posicao]] of Object.entries(esperado)) expect(posShiny.get(id), id).toEqual({ caixa, posicao });
    expect(posShiny.has("victini")).toBe(false);
    expect(posShiny.has("pecharunt")).toBe(false);
  });

  it("caixas reservadas deslocam a trilha shiny também: com 2, a Nacional 1 shiny é a caixa 93", () => {
    const shiny = montarCaixasDex(formas, "shiny", todas);
    const com2 = montarCaixasDex(formas, "shiny", todas, 2);
    expect(com2.map((c) => c.numero)).toEqual(shiny.map((c) => c.numero + 2));
    expect(arranjo(com2)).toEqual(arranjo(shiny));
    expect(posicoesNasCaixas(com2).get("bulbasaur")).toEqual({ caixa: 93, posicao: 1 });
    expect(posicoesNasCaixas(montarCaixasDex(formas, "normal", todas, 2)).get("bulbasaur")).toEqual({ caixa: 3, posicao: 1 });
  });
});

describe("caixas do HOME — nada se mexe", () => {
  it("seção desligada esconde o grupo dela sem renumerar nenhum outro", () => {
    for (const secao of ["genero", "regional", "especial"] as const) {
      const desligada = montarCaixasDex(formas, "normal", { ...todas, [secao]: false });
      expect(desligada.some((c) => c.grupo === secao)).toBe(false);
      const m = mapa(desligada);
      for (const [id, lugar] of mapa(caixas)) if (m.has(id)) expect(m.get(id), `${id} com ${secao} desligada`).toBe(lugar);
    }
  });

  it("com Gênero desligado, a fêmea do Sneasel de Hisui vira buraco no lugar dela", () => {
    const semGenero = montarCaixasDex(formas, "normal", { ...todas, genero: false });
    const hisui = semGenero.find((c) => c.regiao === "hisui")!;
    expect(hisui.lugares[7]).toMatchObject({ forma: { id: "sneasel-hisui-femea" }, buraco: "secao_desligada" });
    expect(posicoesNasCaixas(semGenero).has("sneasel-hisui-femea")).toBe(false);
    expect(posicoesNasCaixas(semGenero).get("decidueye-hisui")).toEqual({ caixa: 54, posicao: 17 });
  });

  /*
   * As duas trilhas moram no mesmo HOME: a shiny repete o arranjo da normal
   * (grupo, região, índice e vagas de cada caixa), mas cada número é o da
   * normal + 90, a partir da `ANCORA_SHINY`.
   */
  it("a trilha shiny tem o mesmo arranjo, 90 caixas depois da normal; forma sem shiny é buraco marcado, sem posição para guardar", () => {
    const shiny = montarCaixasDex(formas, "shiny", todas);
    expect(arranjo(shiny)).toEqual(arranjo(caixas));
    expect(shiny.map((c) => c.numero)).toEqual(caixas.map((c) => c.numero + 90));
    expect(shiny[0].numero).toBe(ANCORA_SHINY);
    const semShiny = formas.filter((f) => !f.shinyObtenivel);
    expect(semShiny.length).toBeGreaterThan(0);
    const buracos = shiny.flatMap((c) => c.lugares.filter((l) => l.buraco !== null));
    expect(buracos.map((l) => l.forma.id).sort()).toEqual(semShiny.map((f) => f.id).sort());
    for (const l of buracos) expect(l.buraco).toBe("sem_shiny");
    const posShiny = posicoesNasCaixas(shiny);
    for (const f of semShiny) expect(posShiny.has(f.id)).toBe(false);
    expect(shiny[16].lugares[13]).toMatchObject({ forma: { id: "victini" }, buraco: "sem_shiny" });
    // Na normal, nenhum buraco.
    for (const c of caixas) for (const l of c.lugares) expect(l.buraco).toBeNull();
  });

  it("espécie nova, fêmea nova, forma regional nova e cosmética e especial de jogo novo entram no fim", () => {
    const LANCAMENTO_NOVO = Math.max(...formas.map((f) => f.lancamento)) + 1;
    const nova = (id: string, numero: number, categoria: FormaParaCaixa["categoria"], ordem: number): FormaParaCaixa => ({
      id,
      numero,
      categoria,
      shinyObtenivel: true,
      ordem,
      lancamento: LANCAMENTO_NOVO,
    });
    const ultimaOrdem = Math.max(...formas.map((f) => f.ordem));
    const novas = [
      nova("especie-1026", 1026, "base", ultimaOrdem + 1),
      nova("especie-1026-femea", 1026, "genero", ultimaOrdem + 2),
      // Regional de Paldea de uma espécie de Kanto: na espécie, cairia no meio de Kanto.
      nova("pidgey-paldea", 16, "regional", 20),
      nova("vivillon-nova", 666, "cosmetica", 899),
      nova("rotom-nova", 479, "especial", 668),
    ];
    const depois = montarCaixasDex([...formas, ...novas], "normal", todas);
    const antes = mapa(caixas);
    const m = mapa(depois);
    for (const [id, lugar] of antes) expect(m.get(id), id).toBe(lugar);
    expect(posicoesNasCaixas(depois).get("especie-1026")).toEqual({ caixa: 35, posicao: 6 });
    expect(posicoesNasCaixas(depois).get("especie-1026-femea")).toEqual({ caixa: 49, posicao: 13 });
    expect(posicoesNasCaixas(depois).get("pidgey-paldea")).toEqual({ caixa: 55, posicao: 5 });
    expect(posicoesNasCaixas(depois).get("rotom-nova")).toEqual({ caixa: 61, posicao: 10 });
    expect(posicoesNasCaixas(depois).get("vivillon-nova")).toEqual({ caixa: 70, posicao: 14 });
  });
});
