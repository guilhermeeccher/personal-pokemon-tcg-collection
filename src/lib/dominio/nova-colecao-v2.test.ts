import { describe, expect, it } from "vitest";

import {
  adicionarSetNaReceita,
  alternarRegiao,
  buscarSets,
  catalogoDoSetEscolhido,
  tipoDaReceita,
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

const oc = (setId: string) => ({ set: { setId }, catalogo: "ocidental" as const });
const jp = (setId: string) => ({ set: { setId }, catalogo: "jp" as const });

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
      sets: [oc("30th"), oc("30th-c")],
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
    const r = montarCorpoCriacao({ ...base, tipo: "customizada", escopo: "regioes", sets: [oc("x")] });
    expect(r).toMatchObject({ ok: true, corpo: { tipo: "customizada", parametro: null } });
  });

  it("pokédex ignora a receita de set que ficou no estado", () => {
    const r = montarCorpoCriacao({ ...base, sets: [oc("x")] });
    expect(r).toMatchObject({ ok: true, corpo: { parametro: { escopo: "nacional" } } });
  });
});

describe("receita de sets", () => {
  it("acrescenta ao fim e não repete o mesmo set do mesmo catálogo", () => {
    const a = adicionarSetNaReceita([], oc("a"));
    const b = adicionarSetNaReceita(a, oc("b"));
    expect(adicionarSetNaReceita(b, oc("a")).map((r) => r.set.setId)).toEqual(["a", "b"]);
  });

  it("o mesmo set_id de outro catálogo entra: é outro conjunto de cartas", () => {
    const r = adicionarSetNaReceita(adicionarSetNaReceita([], oc("neo1")), jp("neo1"));
    expect(r.map((x) => x.catalogo)).toEqual(["ocidental", "jp"]);
  });

  it("remove só o set do catálogo pedido e mantém a ordem dos outros", () => {
    const r = removerSetDaReceita([oc("a"), oc("neo1"), jp("neo1"), oc("c")], "neo1", "jp");
    expect(r.map((x) => `${x.set.setId}:${x.catalogo}`)).toEqual(["a:ocidental", "neo1:ocidental", "c:ocidental"]);
  });
});

describe("catalogoDoSetEscolhido", () => {
  const soJp = { idiomaCatalogo: "jp" as const, idiomasDisponiveis: ["jp" as const] };
  const soOcidental = { idiomaCatalogo: "pt" as const, idiomasDisponiveis: ["pt" as const, "en" as const] };
  // neo1: dois catálogos com o mesmo set_id; a linha vem pela prioridade pt > en > jp.
  const neo1 = { idiomaCatalogo: "en" as const, idiomasDisponiveis: ["en" as const, "jp" as const] };

  it("set só japonês é japonês em qualquer filtro", () => {
    for (const f of ["todos", "pt", "en", "jp"] as const) expect(catalogoDoSetEscolhido(soJp, f)).toBe("jp");
  });

  it("set ocidental é ocidental em qualquer filtro, inclusive Japonês", () => {
    for (const f of ["todos", "pt", "en", "jp"] as const) expect(catalogoDoSetEscolhido(soOcidental, f)).toBe("ocidental");
  });

  it("neo1 escolhido com o filtro Japonês é japonês", () => {
    expect(catalogoDoSetEscolhido(neo1, "jp")).toBe("jp");
  });

  it("neo1 escolhido com Todos, pt ou en é ocidental: decide o catálogo, não o id", () => {
    for (const f of ["todos", "pt", "en"] as const) expect(catalogoDoSetEscolhido(neo1, f)).toBe("ocidental");
  });
});

describe("tipoDaReceita", () => {
  it("vazia, só ocidental, só japonesa e mistura", () => {
    expect(tipoDaReceita([])).toBe("vazia");
    expect(tipoDaReceita([oc("a"), oc("b")])).toBe("ocidental");
    expect(tipoDaReceita([jp("a"), jp("b")])).toBe("japonesa");
    expect(tipoDaReceita([oc("a"), jp("b")])).toBe("mista");
  });

  it("neo1 em jp e neo1 em en juntos são mistura, mesmo com o mesmo id", () => {
    expect(tipoDaReceita([oc("neo1"), jp("neo1")])).toBe("mista");
  });
});

describe("montarCorpoCriacao com catálogo japonês", () => {
  const set = { ...base, tipo: "set" as const };

  it("receita só japonesa manda idiomaCatalogo jp sem perguntar, mesmo com pt no estado", () => {
    const r = montarCorpoCriacao({ ...set, sets: [jp("sv2a"), jp("neo1")], idiomaCatalogo: "pt" });
    expect(r).toMatchObject({
      ok: true,
      corpo: { parametro: { sets: ["sv2a", "neo1"], idiomaCatalogo: "jp", incluirSecretas: false } },
    });
  });

  it("neo1 escolhido em jp vai como jp; escolhido em en vai com a preferência ocidental", () => {
    expect(montarCorpoCriacao({ ...set, sets: [jp("neo1")] })).toMatchObject({
      corpo: { parametro: { sets: ["neo1"], idiomaCatalogo: "jp" } },
    });
    expect(montarCorpoCriacao({ ...set, sets: [oc("neo1")], idiomaCatalogo: "en" })).toMatchObject({
      corpo: { parametro: { sets: ["neo1"], idiomaCatalogo: "en" } },
    });
  });

  it("receita só ocidental continua com a preferência pt/en", () => {
    expect(montarCorpoCriacao({ ...set, sets: [oc("a")], idiomaCatalogo: "en" })).toMatchObject({
      corpo: { parametro: { idiomaCatalogo: "en" } },
    });
  });

  it("a mistura não vai ao servidor", () => {
    expect(montarCorpoCriacao({ ...set, sets: [oc("a"), jp("b")] })).toEqual({ ok: false, erro: "mistura" });
    expect(montarCorpoCriacao({ ...set, sets: [oc("neo1"), jp("neo1")] })).toEqual({ ok: false, erro: "mistura" });
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
  const r = (qtdOficial: number, qtdTotal: number, idiomaCatalogo: "pt" | "jp" = "pt", catalogo: "ocidental" | "jp" = "ocidental") => ({
    set: { qtdOficial, qtdTotal, idiomaCatalogo },
    catalogo,
  });

  it("soma o total e as oficiais", () => {
    expect(totaisDeSecretas([r(165, 207), r(100, 110)])).toEqual({ total: 317, oficiais: 265 });
  });

  it("set sem numeração oficial conta o total dos dois lados", () => {
    expect(totaisDeSecretas([r(0, 104)])).toEqual({ total: 104, oficiais: 104 });
  });

  it("set só japonês usa a própria linha", () => {
    expect(totaisDeSecretas([r(165, 190, "jp", "jp")])).toEqual({ total: 190, oficiais: 165 });
  });

  it("neo1 escolhido em jp, com a linha ocidental na tela, não mostra números de outro catálogo", () => {
    expect(totaisDeSecretas([r(111, 111, "pt", "jp")])).toBeNull();
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
