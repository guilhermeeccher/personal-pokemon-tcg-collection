import { describe, expect, it } from "vitest";

import type { PosicaoNaCaixa } from "@/lib/dominio/dex-caixas";
import type { DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { mapearEstadosDex } from "@/lib/dominio/dex-estado";

import {
  alternarVaga,
  contarSelecao,
  linhasDoLote,
  motivoDoBloqueio,
  registrosQueSeriamMovidos,
  saidaValida,
  tirarDaSelecao,
  type ContextoLote,
  type RegistroParaLote,
  type Selecao,
} from "./lote-envio";

const vazia: Selecao = new Map();

describe("alternarVaga", () => {
  it("marca e desmarca por vaga e trilha: a mesma forma nas duas trilhas são dois itens", () => {
    let s = alternarVaga(vazia, { formaId: "pikachu", shiny: false }, true, 500).selecao;
    s = alternarVaga(s, { formaId: "pikachu", shiny: true }, true, 500).selecao;
    expect([...s.keys()]).toEqual(["pikachu:normal", "pikachu:shiny"]);
    const r = alternarVaga(s, { formaId: "pikachu", shiny: false }, false, 500);
    expect(r.evento).toBe("desmarcou");
    expect([...r.selecao.keys()]).toEqual(["pikachu:shiny"]);
  });

  it("marcar o que já está marcado não muda a seleção (o mesmo objeto)", () => {
    const s = alternarVaga(vazia, { formaId: "pikachu", shiny: false }, true, 500).selecao;
    const r = alternarVaga(s, { formaId: "pikachu", shiny: false }, true, 500);
    expect(r.selecao).toBe(s);
    expect(r.evento).toBe("marcou");
  });

  it("o teto barra só o marcar; desmarcar no teto sempre passa", () => {
    const cheia = alternarVaga(vazia, { formaId: "a", shiny: false }, true, 1).selecao;
    const barrada = alternarVaga(cheia, { formaId: "b", shiny: false }, true, 1);
    expect(barrada).toEqual({ selecao: cheia, evento: "teto" });
    expect(alternarVaga(cheia, { formaId: "a", shiny: false }, false, 1).selecao.size).toBe(0);
  });
});

describe("tirarDaSelecao e contarSelecao", () => {
  it("tira as chaves pedidas e conta normal e shiny à parte", () => {
    const s: Selecao = new Map([
      ["a:normal", { formaId: "a", shiny: false }],
      ["b:shiny", { formaId: "b", shiny: true }],
      ["c:shiny", { formaId: "c", shiny: true }],
    ]);
    expect(contarSelecao(s)).toEqual({ normal: 1, shiny: 2 });
    const t = tirarDaSelecao(s, ["b:shiny", "x:normal"]);
    expect([...t.keys()]).toEqual(["a:normal", "c:shiny"]);
    expect(tirarDaSelecao(s, ["x:normal"])).toBe(s);
  });
});

const reg = (id: string, formaId: string, local: string, jogoOrigem = local, shiny = false): RegistroParaLote => ({
  id,
  formaId,
  shiny,
  jogoOrigem,
  local,
});

describe("registrosQueSeriamMovidos", () => {
  const registros = [
    reg("r1", "rattata", "scarlet", "sword"),
    reg("r2", "rattata", "scarlet"),
    reg("r3", "rattata", "go"),
    reg("r4", "rattata", "scarlet", "scarlet", true),
  ];

  it("o primeiro da vaga e trilha no jogo de saída, na ordem recebida (o mais antigo)", () => {
    const m = registrosQueSeriamMovidos(registros, "scarlet");
    expect(m.get("rattata:normal")?.id).toBe("r1");
    expect(m.get("rattata:shiny")?.id).toBe("r4");
    expect(registrosQueSeriamMovidos(registros, "go").get("rattata:normal")?.id).toBe("r3");
  });

  it("saída pelo HOME, ou nenhuma escolhida, não move nada", () => {
    expect(registrosQueSeriamMovidos(registros, "home").size).toBe(0);
    expect(registrosQueSeriamMovidos(registros, null).size).toBe(0);
  });
});

type F = { id: string; numero: number };
const FORMAS: F[] = [
  { id: "bulbasaur", numero: 1 },
  { id: "rattata", numero: 19 },
  { id: "spinda", numero: 327 },
  { id: "mew", numero: 151 },
  { id: "pikachu", numero: 25 },
];
const pos = (caixa: number, posicao: number): PosicaoNaCaixa => ({ caixa, posicao });

function contexto(parcial: Partial<ContextoLote<F>>): ContextoLote<F> {
  return {
    formaPorId: new Map(FORMAS.map((f) => [f.id, f])),
    posicoes: {
      normal: new Map([
        ["bulbasaur", pos(1, 1)],
        ["rattata", pos(1, 19)],
        ["pikachu", pos(1, 25)],
        ["mew", pos(6, 1)],
        ["spinda", pos(11, 27)],
      ]),
      shiny: new Map([["pikachu", pos(91, 25)]]),
    },
    estados: mapearEstadosDex([]),
    saida: null,
    catalogo: null,
    naoVaiAoHome: new Set(),
    movidos: new Map(),
    trancadas: new Map(),
    ...parcial,
  };
}

const sel = (...itens: [string, boolean][]): Selecao =>
  new Map(itens.map(([formaId, shiny]) => [`${formaId}:${shiny ? "shiny" : "normal"}`, { formaId, shiny }]));

describe("linhasDoLote", () => {
  it("ordem das caixas, com o destino de cada trilha; forma fora do catálogo não entra", () => {
    const linhas = linhasDoLote(sel(["mew", false], ["pikachu", true], ["bulbasaur", false], ["sumiu", false]), contexto({}));
    expect(linhas.map((l) => [l.chave, l.destino])).toEqual([
      ["bulbasaur:normal", pos(1, 1)],
      ["mew:normal", pos(6, 1)],
      ["pikachu:shiny", pos(91, 25)],
    ]);
    expect(linhas.every((l) => l.marcas.length === 0 && !l.impede)).toBe(true);
  });

  it("sem lugar nas caixas (seção desligada em outra aba): destino nulo, no fim", () => {
    const linhas = linhasDoLote(sel(["rattata", true], ["bulbasaur", false]), contexto({}));
    expect(linhas.map((l) => [l.chave, l.destino])).toEqual([
      ["bulbasaur:normal", pos(1, 1)],
      ["rattata:shiny", null],
    ]);
  });

  it("marcas que só avisam: fora do jogo, troca e evento, trancada, o que será movido e onde nasceu", () => {
    const catalogo = new Map<string, DisponibilidadeForma>([
      ["rattata", { como: "livre", transferivel: true }],
      ["pikachu", { como: "troca", transferivel: true }],
      ["mew", { como: "evento", transferivel: true }],
    ]);
    const linhas = linhasDoLote(
      sel(["rattata", false], ["pikachu", false], ["mew", false], ["bulbasaur", false]),
      contexto({
        saida: "scarlet",
        catalogo,
        movidos: new Map([["rattata:normal", reg("r1", "rattata", "scarlet", "sword")]]),
        trancadas: new Map([[151, "Liga"]]),
      }),
    );
    const marcas = Object.fromEntries(linhas.map((l) => [l.forma.id, l.marcas]));
    expect(marcas.bulbasaur).toEqual([{ tipo: "foraDoJogo" }]);
    expect(marcas.rattata).toEqual([
      { tipo: "moveDoJogo", jogo: "scarlet" },
      { tipo: "nascidoEm", jogo: "sword" },
    ]);
    expect(marcas.pikachu).toEqual([{ tipo: "como", como: "troca" }]);
    expect(marcas.mew).toEqual([
      { tipo: "como", como: "evento" },
      { tipo: "trancada", checkpoint: "Liga" },
    ]);
    expect(linhas.some((l) => l.impede)).toBe(false);
  });

  it("um registro nascido no próprio jogo de saída não ganha \"nascido em\"", () => {
    const [l] = linhasDoLote(
      sel(["rattata", false]),
      contexto({ saida: "go", movidos: new Map([["rattata:normal", reg("r3", "rattata", "go")]]) }),
    );
    expect(l.marcas).toEqual([{ tipo: "moveDoJogo", jogo: "go" }]);
  });

  it("o que impede (não vai ao HOME daquele jogo, vaga já no HOME) vem primeiro", () => {
    const linhas = linhasDoLote(
      sel(["bulbasaur", false], ["spinda", false], ["pikachu", true]),
      contexto({
        saida: "go",
        naoVaiAoHome: new Set(["go:spinda"]),
        estados: mapearEstadosDex([{ formaId: "pikachu", shiny: true, local: "home" }]),
      }),
    );
    expect(linhas.map((l) => [l.chave, l.impede])).toEqual([
      ["spinda:normal", true],
      ["pikachu:shiny", true],
      ["bulbasaur:normal", false],
    ]);
    expect(linhas[0].marcas).toEqual([{ tipo: "naoVaiAoHome" }]);
    expect(linhas[1].marcas).toEqual([{ tipo: "jaNoHome" }]);
  });

  it("o HOME só barra a forma do jogo de saída: o mesmo Spinda saindo do Scarlet passa", () => {
    const [l] = linhasDoLote(sel(["spinda", false]), contexto({ saida: "scarlet", naoVaiAoHome: new Set(["go:spinda"]) }));
    expect(l.impede).toBe(false);
  });
});

describe("motivoDoBloqueio", () => {
  const ok = { impede: false };
  const ruim = { impede: true };

  it("na ordem em que a pessoa resolve: lote vazio, teto, saída, impedidos", () => {
    expect(motivoDoBloqueio([], "go", 2)).toEqual({ tipo: "loteVazio" });
    expect(motivoDoBloqueio([ok, ok, ruim], null, 2)).toEqual({ tipo: "acimaDoTeto", excesso: 1 });
    expect(motivoDoBloqueio([ok, ruim], null, 2)).toEqual({ tipo: "escolhaSaida" });
    expect(motivoDoBloqueio([ok, ruim], "go", 2)).toEqual({ tipo: "impedidos", quantidade: 1 });
    expect(motivoDoBloqueio([ok, ok], "go", 2)).toBeNull();
  });
});

describe("saidaValida", () => {
  it("a escolhida vence a lembrada; nenhuma vale fora das opções (jogo parado)", () => {
    expect(saidaValida("go", "scarlet", ["go", "scarlet", "home"])).toBe("go");
    expect(saidaValida(null, "scarlet", ["go", "scarlet", "home"])).toBe("scarlet");
    expect(saidaValida(null, "sword", ["go", "home"])).toBeNull();
    expect(saidaValida("sword", "go", ["go", "home"])).toBeNull();
    expect(saidaValida(null, null, ["home"])).toBeNull();
  });
});
