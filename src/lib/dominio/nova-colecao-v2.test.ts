import { describe, expect, it } from "vitest";

import {
  adicionarSetNaReceita,
  alternarRegiao,
  buscarSets,
  type EstadoFormularioNova,
  montarCorpoCriacao,
  removerSetDaReceita,
  resolverSetInicial,
  totaisDeSecretas,
} from "./nova-colecao-v2";

const base: EstadoFormularioNova = {
  tipo: "pokedex",
  nome: "Minha Pokédex",
  idiomaExigido: "",
  notas: "",
  grupoId: "",
  escopo: "nacional",
  regioes: [],
  sets: [],
  idiomaCatalogo: "pt",
  incluirSecretas: false,
};

describe("montarCorpoCriacao", () => {
  it("pokédex nacional: o mesmo corpo que a v1 manda, com os opcionais vazios fora", () => {
    expect(montarCorpoCriacao(base)).toEqual({
      ok: true,
      corpo: {
        nome: "Minha Pokédex",
        tipo: "pokedex",
        parametro: { escopo: "nacional" },
        idiomaExigido: undefined,
        notas: undefined,
        grupoId: null,
      },
    });
  });

  it("pokédex por regiões manda as regiões na ordem escolhida", () => {
    const r = montarCorpoCriacao({ ...base, escopo: "regioes", regioes: ["johto", "kanto"] });
    expect(r).toMatchObject({ ok: true, corpo: { parametro: { escopo: "regioes", regioes: ["johto", "kanto"] } } });
  });

  it("pokédex por regiões sem nenhuma região não vai ao servidor", () => {
    expect(montarCorpoCriacao({ ...base, escopo: "regioes" })).toEqual({ ok: false, erro: "regiao" });
  });

  it("a região que sobrou depois de desmarcar a escolha não conta mais", () => {
    const regioes = alternarRegiao(alternarRegiao([], "kanto"), "kanto");
    expect(montarCorpoCriacao({ ...base, escopo: "regioes", regioes })).toEqual({ ok: false, erro: "regiao" });
  });

  it("set: a receita em ordem, o idioma preferido e as secretas", () => {
    const r = montarCorpoCriacao({
      ...base,
      tipo: "set",
      sets: [{ setId: "30th" }, { setId: "30th-c" }],
      idiomaCatalogo: "en",
      incluirSecretas: true,
      idiomaExigido: "pt",
      notas: "n",
      grupoId: "g1",
    });
    expect(r).toEqual({
      ok: true,
      corpo: {
        nome: "Minha Pokédex",
        tipo: "set",
        parametro: { sets: ["30th", "30th-c"], idiomaCatalogo: "en", incluirSecretas: true },
        idiomaExigido: "pt",
        notas: "n",
        grupoId: "g1",
      },
    });
  });

  it("set sem nenhum set na receita não vai ao servidor", () => {
    expect(montarCorpoCriacao({ ...base, tipo: "set" })).toEqual({ ok: false, erro: "expansao" });
  });

  it("customizada não leva parâmetro, e o escopo e a receita que sobraram no estado não vazam", () => {
    const r = montarCorpoCriacao({ ...base, tipo: "customizada", escopo: "regioes", sets: [{ setId: "x" }] });
    expect(r).toMatchObject({ ok: true, corpo: { tipo: "customizada", parametro: null } });
  });

  it("pokédex ignora a receita de set que ficou no estado", () => {
    const r = montarCorpoCriacao({ ...base, sets: [{ setId: "x" }] });
    expect(r).toMatchObject({ ok: true, corpo: { parametro: { escopo: "nacional" } } });
  });
});

describe("receita de sets", () => {
  it("acrescenta ao fim e não repete", () => {
    const a = adicionarSetNaReceita([], { setId: "a" });
    const b = adicionarSetNaReceita(a, { setId: "b" });
    expect(adicionarSetNaReceita(b, { setId: "a" }).map((s) => s.setId)).toEqual(["a", "b"]);
  });

  it("remove só o pedido e mantém a ordem dos outros", () => {
    const r = removerSetDaReceita([{ setId: "a" }, { setId: "b" }, { setId: "c" }], "b");
    expect(r.map((s) => s.setId)).toEqual(["a", "c"]);
  });
});

describe("resolverSetInicial", () => {
  const sets = [
    { setId: "neo1", idiomaCatalogo: "jp" as const },
    { setId: "neo1", idiomaCatalogo: "en" as const },
    { setId: "so-jp", idiomaCatalogo: "jp" as const },
  ];

  it("acha o set ocidental pelo id", () => {
    expect(resolverSetInicial(sets, "neo1")).toEqual({ setId: "neo1", idiomaCatalogo: "en" });
  });

  it("o japonês nunca resolve uma sugestão", () => {
    expect(resolverSetInicial(sets, "so-jp")).toBeNull();
  });

  it("id desconhecido ou vazio não resolve nada", () => {
    expect(resolverSetInicial(sets, "nao-existe")).toBeNull();
    expect(resolverSetInicial(sets, "")).toBeNull();
  });
});

describe("totaisDeSecretas", () => {
  it("soma o total e as oficiais", () => {
    expect(
      totaisDeSecretas([
        { qtdOficial: 165, qtdTotal: 207 },
        { qtdOficial: 100, qtdTotal: 110 },
      ]),
    ).toEqual({ total: 317, oficiais: 265 });
  });

  it("set sem numeração oficial conta o total dos dois lados", () => {
    expect(totaisDeSecretas([{ qtdOficial: 0, qtdTotal: 104 }])).toEqual({ total: 104, oficiais: 104 });
  });
});

describe("buscarSets", () => {
  const sets = [
    { setId: "sv3pt5", setNome: "151", setSigla: "MEW" },
    { setId: "sv2a", setNome: "ポケモンカード151", setSigla: null },
    { setId: "me1", setNome: "Mega Evolution", setSigla: "MEG" },
  ];

  it("acha por nome, por sigla e por id, sem olhar caixa", () => {
    expect(buscarSets(sets, "mega").map((s) => s.setId)).toEqual(["me1"]);
    expect(buscarSets(sets, "mew").map((s) => s.setId)).toEqual(["sv3pt5"]);
    expect(buscarSets(sets, "SV2A").map((s) => s.setId)).toEqual(["sv2a"]);
  });

  it("busca vazia ou só de espaços devolve todos, na ordem recebida", () => {
    expect(buscarSets(sets, "  ").map((s) => s.setId)).toEqual(["sv3pt5", "sv2a", "me1"]);
  });

  it("sem resultado, lista vazia", () => {
    expect(buscarSets(sets, "zzz")).toEqual([]);
  });
});
