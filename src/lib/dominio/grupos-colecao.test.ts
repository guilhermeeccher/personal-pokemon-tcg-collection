import { describe, expect, it } from "vitest";

import {
  colecoesPorSet,
  conferirPedidoExistentes,
  conferirPedidoFaltantes,
  lerCriacaoGrupo,
  lerEdicaoGrupo,
  lerGrupoId,
  lerIds,
  lerPedidoFaltantes,
  MAXIMO_SETS_POR_CRIACAO,
  montarFaltantes,
  motivoDesmarcado,
  nomeSugeridoDoSet,
  parametroDaColecaoFaltante,
  selecionarExistentes,
  seriesOcidentais,
  setsOcidentaisDaSerie,
  TAMANHO_MAXIMO_NOME_GRUPO,
  type ColecaoComReceita,
  type SetDoCatalogo,
} from "./grupos-colecao";

/* Tudo inventado aqui: sets, séries e coleções de mentira. */
const UUID = "0b9f6c1e-2d3a-4c5b-8e7f-1a2b3c4d5e6f";

const set = (s: Partial<SetDoCatalogo> & { setId: string }): SetDoCatalogo => ({
  setNome: `Set ${s.setId}`,
  setSerie: "Série X",
  setSerieId: "x",
  idiomaCatalogo: "pt",
  setLancamento: "2025-01-01",
  setSigla: s.setId.toUpperCase(),
  idiomasDisponiveis: ["pt", "en"],
  qtdOficial: 100,
  ...s,
});

const comContagem = (s: SetDoCatalogo, cartasAtivas = 100, cartasEnergia = 0) => ({
  ...s,
  cartasAtivas,
  cartasEnergia,
});

const colecaoSet = (id: string, sets: string[], grupoId: string | null = null) => ({
  id,
  nome: `Coleção ${id}`,
  tipo: "set" as const,
  parametro: { sets, idiomaCatalogo: "pt", incluirSecretas: false },
  grupoId,
});

describe("lerCriacaoGrupo", () => {
  it("apara o nome e aceita sem série", () => {
    expect(lerCriacaoGrupo({ nome: "  Megaevolução  " })).toEqual({
      ok: true,
      valor: { nome: "Megaevolução", serieId: null },
    });
  });

  it("guarda a série na caixa em que veio", () => {
    const r = lerCriacaoGrupo({ nome: "Sol e Lua", serieId: "SM" });
    expect(r).toEqual({ ok: true, valor: { nome: "Sol e Lua", serieId: "SM" } });
  });

  it("nome vazio ou acima do limite é recusa com chave", () => {
    for (const nome of ["", "   ", "x".repeat(TAMANHO_MAXIMO_NOME_GRUPO + 1), undefined]) {
      const r = lerCriacaoGrupo({ nome });
      expect(r.ok).toBe(false);
      expect(!r.ok && "recusa" in r && r.recusa.chave).toBe("nomeDoGrupoInvalido");
    }
    expect(lerCriacaoGrupo({ nome: "x".repeat(TAMANHO_MAXIMO_NOME_GRUPO) }).ok).toBe(true);
  });

  it("série de tipo errado é corpo malformado", () => {
    const r = lerCriacaoGrupo({ nome: "A", serieId: 3 });
    expect(!r.ok && "erro" in r).toBe(true);
  });
});

describe("lerEdicaoGrupo", () => {
  it("só os campos que vieram; serieId null desliga a série", () => {
    expect(lerEdicaoGrupo({ serieId: null })).toEqual({ ok: true, valor: { serieId: null } });
    expect(lerEdicaoGrupo({ nome: " B " })).toEqual({ ok: true, valor: { nome: "B" } });
  });

  it("edição vazia é corpo malformado", () => {
    const r = lerEdicaoGrupo({});
    expect(!r.ok && "erro" in r).toBe(true);
  });
});

describe("lerGrupoId", () => {
  it("null é sem grupo; UUID é o grupo", () => {
    expect(lerGrupoId(null, false)).toEqual({ ok: true, valor: null });
    expect(lerGrupoId(UUID, false)).toEqual({ ok: true, valor: UUID });
  });

  it("ausente vale sem grupo só onde o campo é opcional", () => {
    expect(lerGrupoId(undefined, true)).toEqual({ ok: true, valor: null });
    expect(lerGrupoId(undefined, false).ok).toBe(false);
  });

  it("texto que não é UUID é recusado", () => {
    expect(lerGrupoId("abc", true).ok).toBe(false);
  });
});

describe("lerIds", () => {
  it("lista não vazia de textos, sem repetição", () => {
    expect(lerIds({ ids: ["a", "b"] })).toEqual({ ok: true, valor: ["a", "b"] });
    expect(lerIds({ ids: [] }).ok).toBe(false);
    expect(lerIds({ ids: ["a", "a"] }).ok).toBe(false);
    expect(lerIds({}).ok).toBe(false);
  });
});

describe("séries ocidentais", () => {
  const sets = [
    set({ setId: "sm1", setSerieId: "sm", setSerie: "Sol e Lua", setLancamento: "2017-02-03" }),
    set({ setId: "sm2", setSerieId: "sm", setSerie: "Sol e Lua", setLancamento: "2017-05-05" }),
    set({
      setId: "SM1S",
      setSerieId: "SM",
      setSerie: "Sun & Moon",
      idiomaCatalogo: "jp",
      idiomasDisponiveis: ["jp"],
      setLancamento: "2016-12-09",
    }),
    set({ setId: "me01", setSerieId: "me", setSerie: "Megaevolução", setLancamento: "2025-09-26" }),
    set({ setId: "semserie", setSerieId: null, setSerie: "Avulsos" }),
  ];

  it("só as séries de sets em pt/en, na ordem do seletor (a mais recente primeiro)", () => {
    expect(seriesOcidentais(sets)).toEqual([
      { serieId: "me", rotulo: "Megaevolução", sets: 1 },
      { serieId: "sm", rotulo: "Sol e Lua", sets: 2 },
    ]);
  });

  it("a série japonesa fica de fora, e a comparação é sensível a caixa", () => {
    expect(setsOcidentaisDaSerie(sets, "SM")).toEqual([]);
    expect(setsOcidentaisDaSerie(sets, "sm").map((s) => s.setId)).toEqual(["sm1", "sm2"]);
  });

  it("set com en e jp (mesmo id nos dois catálogos) conta como ocidental", () => {
    const neo = set({ setId: "neo1", setSerieId: "neo", idiomaCatalogo: "en", idiomasDisponiveis: ["en", "jp"] });
    expect(setsOcidentaisDaSerie([neo], "neo").map((s) => s.setId)).toEqual(["neo1"]);
  });
});

describe("motivoDesmarcado", () => {
  it("promo: sem numeração oficial (como o mep)", () => {
    expect(motivoDesmarcado({ qtdOficial: 0, cartasAtivas: 80, cartasEnergia: 0 })).toBe("promo");
  });

  it("energia: toda carta ativa é Energia (como o mee)", () => {
    expect(motivoDesmarcado({ qtdOficial: 16, cartasAtivas: 32, cartasEnergia: 32 })).toBe("energia");
  });

  it("set normal com algumas Energias não é desmarcado", () => {
    expect(motivoDesmarcado({ qtdOficial: 94, cartasAtivas: 130, cartasEnergia: 1 })).toBeNull();
  });

  it("set sem carta ativa nenhuma não vira 'energia' por vacuidade", () => {
    expect(motivoDesmarcado({ qtdOficial: 10, cartasAtivas: 0, cartasEnergia: 0 })).toBeNull();
  });
});

describe("nomeSugeridoDoSet", () => {
  it("AAAA - SIGLA - Nome", () => {
    expect(nomeSugeridoDoSet({ lancamento: "2025-11-14", sigla: "PFL", nome: "Fogo Fantasmagórico" })).toBe(
      "2025 - PFL - Fogo Fantasmagórico",
    );
  });

  it("sem ano, SIGLA - Nome; sem sigla, AAAA - Nome; sem os dois, só o nome", () => {
    expect(nomeSugeridoDoSet({ lancamento: null, sigla: "PFL", nome: "N" })).toBe("PFL - N");
    expect(nomeSugeridoDoSet({ lancamento: "2025-11-14", sigla: null, nome: "N" })).toBe("2025 - N");
    expect(nomeSugeridoDoSet({ lancamento: "2025-11-14", sigla: "  ", nome: "N" })).toBe("2025 - N");
    expect(nomeSugeridoDoSet({ lancamento: "sem-data", sigla: null, nome: "N" })).toBe("N");
  });
});

describe("parametroDaColecaoFaltante", () => {
  it("é o de uma coleção nova de um set: catálogo pt, sem secretas", () => {
    expect(parametroDaColecaoFaltante("me01")).toEqual({
      sets: ["me01"],
      idiomaCatalogo: "pt",
      incluirSecretas: false,
    });
  });
});

describe("colecoesPorSet — 'já existe' é pela receita", () => {
  it("coleção de vários sets conta para todos; Pokédex e customizada não contam", () => {
    const colecoes: ColecaoComReceita[] = [
      colecaoSet("dupla", ["a", "b"]),
      colecaoSet("so-b", ["b"]),
      { id: "dex", nome: "Dex", tipo: "pokedex", parametro: { escopo: "nacional" } },
      { id: "custom", nome: "C", tipo: "customizada", parametro: null },
    ];
    const porSet = colecoesPorSet(colecoes);
    expect(porSet.get("a")?.map((c) => c.id)).toEqual(["dupla"]);
    expect(porSet.get("b")?.map((c) => c.id)).toEqual(["dupla", "so-b"]);
    expect(porSet.size).toBe(2);
  });

  it("parâmetro sem receita não quebra", () => {
    expect(colecoesPorSet([{ id: "x", nome: "x", tipo: "set", parametro: null }]).size).toBe(0);
  });
});

describe("montarFaltantes", () => {
  const sets = [
    comContagem(set({ setId: "me02", setLancamento: "2025-11-14", setSigla: "PFL", setNome: "Fogo Fantasmagórico" })),
    comContagem(set({ setId: "mee", setLancamento: "2025-09-26", setSigla: null, qtdOficial: 16 }), 16, 16),
    comContagem(set({ setId: "mep", setLancamento: "2025-09-26", qtdOficial: 0, idiomasDisponiveis: ["en"] })),
    comContagem(set({ setId: "me01", setLancamento: "2025-09-26" })),
    comContagem(set({ setId: "semdata", setLancamento: null })),
  ];

  it("em ordem de lançamento (mais antigo primeiro), empate pelo id, sem data por último", () => {
    expect(montarFaltantes(sets, new Map()).map((f) => f.setId)).toEqual(["me01", "mee", "mep", "me02", "semdata"]);
  });

  it("marcado só sem coleção e sem motivo; energia e promo vêm desmarcados com o motivo", () => {
    const existentes = new Map([["me01", [{ id: "c1", nome: "Minha ME01" }]]]);
    const porSet = new Map(montarFaltantes(sets, existentes).map((f) => [f.setId, f]));
    expect(porSet.get("me01")).toMatchObject({
      marcadoPorPadrao: false,
      motivoDesmarcado: null,
      colecoesExistentes: [{ id: "c1", nome: "Minha ME01" }],
    });
    expect(porSet.get("mee")).toMatchObject({ marcadoPorPadrao: false, motivoDesmarcado: "energia" });
    expect(porSet.get("mep")).toMatchObject({ marcadoPorPadrao: false, motivoDesmarcado: "promo", idiomas: ["en"] });
    expect(porSet.get("me02")).toMatchObject({
      marcadoPorPadrao: true,
      motivoDesmarcado: null,
      nomeSugerido: "2025 - PFL - Fogo Fantasmagórico",
      idiomas: ["pt", "en"],
    });
  });
});

describe("lerPedidoFaltantes", () => {
  it("apara os nomes", () => {
    expect(lerPedidoFaltantes({ sets: [{ setId: "a", nome: " A " }] })).toEqual({
      ok: true,
      valor: [{ setId: "a", nome: "A" }],
    });
  });

  it("vazio ou acima do teto é recusa com chave", () => {
    const vazio = lerPedidoFaltantes({ sets: [] });
    expect(!vazio.ok && "recusa" in vazio && vazio.recusa.chave).toBe("quantidadeDeSetsParaCriarInvalida");
    const muitos = Array.from({ length: MAXIMO_SETS_POR_CRIACAO + 1 }, (_, i) => ({ setId: `s${i}`, nome: "n" }));
    expect(lerPedidoFaltantes({ sets: muitos }).ok).toBe(false);
  });

  it("set repetido e nome vazio são recusas com chave", () => {
    const repetido = lerPedidoFaltantes({ sets: [{ setId: "a", nome: "A" }, { setId: "a", nome: "B" }] });
    expect(!repetido.ok && "recusa" in repetido && repetido.recusa).toEqual({
      chave: "setRepetidoNoPedido",
      valores: { setId: "a" },
    });
    const semNome = lerPedidoFaltantes({ sets: [{ setId: "a", nome: "  " }] });
    expect(!semNome.ok && "recusa" in semNome && semNome.recusa.chave).toBe("nomeDaColecaoVazio");
  });
});

describe("conferirPedidoFaltantes", () => {
  const faltantes = montarFaltantes(
    [
      comContagem(set({ setId: "novo", setLancamento: "2025-11-14" })),
      comContagem(set({ setId: "velho", setLancamento: "2025-01-01" })),
      comContagem(set({ setId: "tem", setLancamento: "2025-06-01" })),
    ],
    new Map([["tem", [{ id: "c", nome: "Já tenho" }]]]),
  );

  it("devolve o pedido em ordem de lançamento", () => {
    const r = conferirPedidoFaltantes(
      [
        { setId: "novo", nome: "N" },
        { setId: "velho", nome: "V" },
      ],
      faltantes,
    );
    expect(r).toEqual({ ok: true, pedido: [{ setId: "velho", nome: "V" }, { setId: "novo", nome: "N" }] });
  });

  it("set fora da série (ou não ocidental) recusa o pedido inteiro", () => {
    const r = conferirPedidoFaltantes([{ setId: "outro", nome: "O" }, { setId: "novo", nome: "N" }], faltantes);
    expect(!r.ok && r.recusa.chave).toBe("setForaDaSerieDoGrupo");
  });

  it("set que já ganhou coleção (outra aba) recusa o pedido inteiro, nomeando a coleção", () => {
    const r = conferirPedidoFaltantes([{ setId: "novo", nome: "N" }, { setId: "tem", nome: "T" }], faltantes);
    expect(!r.ok && r.recusa).toEqual({ chave: "setJaTemColecao", valores: { setId: "tem", colecao: "Já tenho" } });
  });
});

describe("selecionarExistentes", () => {
  const nomes = new Map([
    ["g-alvo", "Megaevolução"],
    ["g-outro", "Favoritas"],
  ]);
  const colecoes = [
    colecaoSet("no-alvo", ["me01"], "g-alvo"),
    colecaoSet("em-outro", ["me02"], "g-outro"),
    colecaoSet("solta", ["xx", "me01"]),
    colecaoSet("fora-da-serie", ["sv01"]),
    { id: "dex", nome: "Dex", tipo: "pokedex" as const, parametro: { escopo: "nacional" }, grupoId: null },
  ];

  it("de set, com algum set da série na receita, fora deste grupo, na ordem da lista", () => {
    const r = selecionarExistentes(colecoes, new Set(["me01", "me02"]), "g-alvo", nomes);
    expect(r).toEqual([
      {
        id: "em-outro",
        nome: "Coleção em-outro",
        grupoAtual: { id: "g-outro", nome: "Favoritas" },
        marcadoPorPadrao: false,
      },
      { id: "solta", nome: "Coleção solta", grupoAtual: null, marcadoPorPadrao: true },
    ]);
  });
});

describe("conferirPedidoExistentes", () => {
  const candidatas = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("devolve os pedidos na ordem dos candidatos (a da lista)", () => {
    expect(conferirPedidoExistentes(["c", "a"], candidatas)).toEqual({ ok: true, ids: ["a", "c"] });
  });

  it("um id fora dos candidatos recusa tudo", () => {
    const r = conferirPedidoExistentes(["a", "z"], candidatas);
    expect(!r.ok && r.recusa.chave).toBe("colecaoForaDasExistentesDoGrupo");
  });
});
