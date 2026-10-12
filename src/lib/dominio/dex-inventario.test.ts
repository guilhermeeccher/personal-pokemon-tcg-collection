import { describe, expect, it } from "vitest";

import { agruparInventario, compararPorNome, oportunidadesHome, type RegistroParaInventario } from "./dex-inventario";

let n = 0;
const reg = (formaId: string, local: string, extra: Partial<RegistroParaInventario> = {}): RegistroParaInventario => ({
  id: `r${++n}`,
  formaId,
  shiny: false,
  jogoOrigem: local === "home" ? "firered" : local,
  local,
  capturadoEm: null,
  notas: null,
  ...extra,
});

describe("compararPorNome", () => {
  it("ordena por espécie e, dentro dela, pela ordem do HOME", () => {
    const formas = [
      { id: "raichu-alola", especie: "Raichu", forma: "Alolan Form", ordem: 30 },
      { id: "bulbasaur", especie: "Bulbasaur", forma: null, ordem: 1 },
      { id: "raichu", especie: "Raichu", forma: null, ordem: 28 },
      { id: "flabebe", especie: "Flabébé", forma: "Red Flower", ordem: 900 },
    ];
    expect([...formas].sort(compararPorNome).map((f) => f.id)).toEqual([
      "bulbasaur",
      "flabebe",
      "raichu",
      "raichu-alola",
    ]);
  });
});

describe("agruparInventario", () => {
  it("junta registros iguais e separa o que difere em qualquer campo", () => {
    const a = reg("bulbasaur", "firered");
    const b = reg("bulbasaur", "firered");
    const c = reg("bulbasaur", "firered", { shiny: true });
    const d = reg("bulbasaur", "firered", { notas: "inicial" });
    const grupos = agruparInventario([a, b, c, d]);
    expect(grupos.map((g) => g.ids)).toEqual([[a.id, b.id], [c.id], [d.id]]);
  });
});

describe("oportunidadesHome", () => {
  it("uma vaga conta uma vez, e some quando já está no HOME", () => {
    const r = [
      reg("bulbasaur", "firered"),
      reg("bulbasaur", "firered"),
      reg("charmander", "firered"),
      reg("charmander", "home"),
    ];
    const ops = oportunidadesHome(r);
    expect(ops).toHaveLength(1);
    expect(ops[0].jogoId).toBe("firered");
    expect(ops[0].itens.map((i) => i.formaId)).toEqual(["bulbasaur"]);
  });

  it("trilhas são independentes: o normal no HOME não fecha a vaga shiny", () => {
    const ops = oportunidadesHome([reg("pikachu", "home"), reg("pikachu", "go", { shiny: true })]);
    expect(ops[0].itens).toEqual([expect.objectContaining({ formaId: "pikachu", trilha: "shiny" })]);
  });

  it("com cópias em dois jogos, sugere a do jogo de ida e volta", () => {
    const fr = reg("bulbasaur", "firered");
    const bd = reg("bulbasaur", "brilliant-diamond");
    const ops = oportunidadesHome([fr, bd]);
    expect(ops.map((o) => o.jogoId)).toEqual(["brilliant-diamond"]);
    expect(ops[0].itens[0].registroId).toBe(bd.id);
  });

  it("agrupa por jogo na ordem de lançamento", () => {
    const ops = oportunidadesHome([reg("piplup", "brilliant-diamond"), reg("pidgey", "go"), reg("rattata", "firered")]);
    expect(ops.map((o) => o.jogoId)).toEqual(["firered", "go", "brilliant-diamond"]);
  });
});
