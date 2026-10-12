import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { catalogoDoJogo } from "./dex-disponibilidade";
import { especiesTrancadas, lerSeedTrofeus, progressoTrofeus, type TrofeuParaConta } from "./dex-trofeus";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

const raiz = path.resolve(__dirname, "../../..");
const formas = lerRegistrosCsv(fs.readFileSync(path.join(raiz, "seed/dex-forma.csv"), "utf8"), COLUNAS_DEX_FORMA).map(
  (linha) => ({ ...converterLinhaDexForma(linha), mitico: linha.mitico === "t" }),
);
const trofeus = lerSeedTrofeus(JSON.parse(fs.readFileSync(path.join(raiz, "seed/dex-trofeus.json"), "utf8")));

const base = {
  jogo: "firered",
  tipo: "marco",
  nivel: "bronze",
  "pt-BR": { titulo: "T", descricao: "D" },
  en: { titulo: "T", descricao: "D" },
};
const lerUm = (extra: Record<string, unknown>) => () => lerSeedTrofeus({ trofeus: [{ ...base, id: "firered-x", ...extra }] });

describe("seed/dex-trofeus.json", () => {
  it("lê sem erro e tem troféus dos três jogos dele", () => {
    const jogos = new Set(trofeus.map((t) => t.jogoId));
    expect([...jogos].sort()).toEqual(["brilliant-diamond", "firered", "go"]);
  });

  it("um troféu de líder por ginásio no FireRed e no BD", () => {
    expect(trofeus.filter((t) => t.id.startsWith("firered-insignia-")).length).toBe(8);
    expect(trofeus.filter((t) => t.id.startsWith("brilliant-diamond-insignia-")).length).toBe(8);
  });

  /*
   * O que um checkpoint libera tem que existir no jogo. Uma faixa digitada
   * errada trancaria uma espécie que o jogo nem tem, e o erro só apareceria
   * como um cadeado sem sentido na tela.
   */
  it.each(["firered", "brilliant-diamond", "go"])("%s: toda espécie liberada está no catálogo do jogo", (jogo) => {
    const especies = new Set([...catalogoDoJogo(jogo, formas)!.keys()].map((id) => formas.find((f) => f.id === id)!.numero));
    const fora = trofeus.filter((t) => t.jogoId === jogo).flatMap((t) => t.libera.filter((n) => !especies.has(n)).map((n) => `${t.id}:${n}`));
    expect(fora).toEqual([]);
  });

  it("FireRed: Lugia pede o Hall da Fama e o Rainbow Pass; Unown, o Tanoby Key", () => {
    const tranc = especiesTrancadas(trofeus, "firered", new Set());
    expect(tranc.get(249)?.sort()).toEqual(["firered-campeao", "firered-ilhas-sevii-4-7", "firered-pokedex-nacional"]);
    expect(tranc.get(201)).toContain("firered-tanoby");
    expect(tranc.has(25)).toBe(false);
  });

  /*
   * Grand Underground (2026-10-12): os Base Encounters e os Rare Spawns dos
   * esconderijos não pedem marco nenhum, só o Explorer Kit. Os estágios
   * seguintes (Strength, Defog, Icicle, Waterfall) só trazem espécies da
   * Pokédex de Sinnoh, que nenhum checkpoint tranca.
   */
  it("BD: o que o Grand Underground tem desde o começo pede só o Explorer Kit", () => {
    const tranc = especiesTrancadas(trofeus, "brilliant-diamond", new Set());
    for (const n of [280, 282, 175, 468, 359, 361, 478]) expect(tranc.get(n)).toEqual(["brilliant-diamond-kit-explorador"]);
    expect(tranc.get(228)).toEqual(["brilliant-diamond-pokedex-nacional"]);
    expect(trofeus.find((t) => t.id === "brilliant-diamond-kit-explorador")!.libera).toHaveLength(37);
  });

  it("BD: Heatran e Giratina só pedem o Hall da Fama; Regigigas pede os três Regi", () => {
    const tranc = especiesTrancadas(trofeus, "brilliant-diamond", new Set());
    expect(tranc.get(485)).toEqual(["brilliant-diamond-campeao"]);
    expect(tranc.get(487)).toEqual(["brilliant-diamond-campeao"]);
    expect(tranc.get(486)).toContain("brilliant-diamond-gigantes");
    expect(tranc.has(151)).toBe(false);
  });
});

describe("lerSeedTrofeus", () => {
  it("checkpoint sem libera ou sem fonte é recusado", () => {
    expect(lerUm({ tipo: "checkpoint", fonte: "x" })).toThrow(/must list what it unlocks/);
    expect(lerUm({ tipo: "checkpoint", libera: "1" })).toThrow(/fonte/);
  });

  it("marco não libera espécie", () => {
    expect(lerUm({ libera: "1-3" })).toThrow(/make it a checkpoint/);
  });

  it("id fora do padrão, jogo desconhecido e texto faltando", () => {
    expect(lerUm({ id: "FireRed X" })).toThrow(/lowercase/);
    expect(() => lerSeedTrofeus({ trofeus: [{ ...base, id: "pokemon-red-x", jogo: "pokemon-red" }] })).toThrow(/unknown game/);
    expect(lerUm({ en: { titulo: "" } })).toThrow(/missing en/);
  });

  it("requer só aponta para troféu anterior do mesmo jogo", () => {
    expect(lerUm({ requer: ["firered-depois"] })).toThrow(/not an earlier trophy/);
    const outroJogo = { ...base, id: "go-a", jogo: "go" };
    expect(() => lerSeedTrofeus({ trofeus: [outroJogo, { ...base, id: "firered-b", requer: ["go-a"] }] })).toThrow(
      /another game/,
    );
  });

  it("junta todos os problemas num erro só", () => {
    expect(() =>
      lerSeedTrofeus({ trofeus: [{ ...base, id: "firered-a", libera: "1" }, { ...base, id: "firered-a" }] }),
    ).toThrow(/2 problem\(s\)/);
  });
});

describe("contas", () => {
  const lista: TrofeuParaConta[] = [
    { id: "j-a", jogoId: "j", tipo: "checkpoint", nivel: "bronze", libera: [1, 2] },
    { id: "j-b", jogoId: "j", tipo: "checkpoint", nivel: "prata", libera: [2, 3] },
    { id: "j-c", jogoId: "j", tipo: "marco", nivel: "ouro", libera: [] },
    { id: "k-a", jogoId: "k", tipo: "checkpoint", nivel: "ouro", libera: [9] },
  ];

  it("espécie destrava só quando todos os checkpoints que a listam estão feitos", () => {
    const tranc = especiesTrancadas(lista, "j", new Set(["j-a"]));
    expect(tranc.has(1)).toBe(false);
    expect(tranc.get(2)).toEqual(["j-b"]);
    expect(tranc.has(9)).toBe(false);
  });

  it("platina só com todos os troféus do jogo", () => {
    expect(progressoTrofeus(lista, "j", new Set(["j-a", "j-b"])).platina).toBe(false);
    const p = progressoTrofeus(lista, "j", new Set(["j-a", "j-b", "j-c", "k-a"]));
    expect(p).toMatchObject({ total: 3, obtidos: 3, platina: true });
    expect(p.porNivel.ouro).toEqual({ total: 1, obtidos: 1 });
    expect(progressoTrofeus(lista, "nenhum", new Set()).platina).toBe(false);
  });
});
