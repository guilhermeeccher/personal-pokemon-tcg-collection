import { describe, expect, it } from "vitest";

import {
  colecoesPorSet,
  conferirPedidoExistentes,
  conferirPedidoFaltantes,
  lerCriacaoGrupo,
  lerEdicaoGrupo,
  lerGrupoId,
  conferirSerieDoPedido,
  lerPedidoExistentes,
  lerPedidoFaltantes,
  MAXIMO_COLECOES_POR_TRAZER,
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

const colecaoSet = (id: string, sets: string[], grupoId: string | null = null, idiomaCatalogo = "pt") => ({
  id,
  nome: `Coleção ${id}`,
  tipo: "set" as const,
  parametro: { sets, idiomaCatalogo, incluirSecretas: false },
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

  it("UUID em maiúsculas é canonizado, para bater com o id que vem do banco", () => {
    expect(lerGrupoId(UUID.toUpperCase(), false)).toEqual({ ok: true, valor: UUID });
  });
});

const UUID_B = "1c8e5d2f-3e4b-4d6c-9f80-2b3c4d5e6f70";

describe("lerPedidoExistentes", () => {
  it("série da prévia e itens com o grupo de origem, ids canonizados", () => {
    const r = lerPedidoExistentes({
      serieId: "me",
      itens: [
        { id: UUID.toUpperCase(), grupoOrigemId: null },
        { id: UUID_B, grupoOrigemId: UUID.toUpperCase() },
      ],
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        serieId: "me",
        itens: [
          { id: UUID, grupoOrigemId: null },
          { id: UUID_B, grupoOrigemId: UUID },
        ],
      },
    });
  });

  it("série fica na caixa em que veio (SM não é sm)", () => {
    const r = lerPedidoExistentes({ serieId: "SM", itens: [{ id: UUID, grupoOrigemId: null }] });
    expect(r.ok && r.valor.serieId).toBe("SM");
  });

  it("sem série, sem itens, acima do teto, id ou origem inválidos, ou origem ausente: corpo malformado", () => {
    const item = { id: UUID, grupoOrigemId: null };
    const muitos = Array.from({ length: MAXIMO_COLECOES_POR_TRAZER + 1 }, () => item);
    for (const corpo of [
      { itens: [item] },
      { serieId: "", itens: [item] },
      { serieId: "me", itens: [] },
      { serieId: "me", itens: muitos },
      { serieId: "me", itens: [{ id: "x", grupoOrigemId: null }] },
      { serieId: "me", itens: [{ id: UUID, grupoOrigemId: "x" }] },
      { serieId: "me", itens: [{ id: UUID }] },
      { serieId: "me", ids: [UUID] },
    ]) {
      const r = lerPedidoExistentes(corpo);
      expect(!r.ok && "erro" in r, JSON.stringify(corpo).slice(0, 80)).toBe(true);
    }
  });

  it("a mesma coleção em duas caixas é repetição", () => {
    const r = lerPedidoExistentes({
      serieId: "me",
      itens: [
        { id: UUID, grupoOrigemId: null },
        { id: UUID.toUpperCase(), grupoOrigemId: null },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe("conferirSerieDoPedido", () => {
  it("a mesma série passa; trocada, desligada ou em outra caixa é lote velho (409)", () => {
    expect(conferirSerieDoPedido("me", "me")).toBeNull();
    expect(conferirSerieDoPedido("sv", "me")?.chave).toBe("ordemDeColecoesDesatualizada");
    expect(conferirSerieDoPedido(null, "me")?.chave).toBe("ordemDeColecoesDesatualizada");
    expect(conferirSerieDoPedido("SM", "sm")?.chave).toBe("ordemDeColecoesDesatualizada");
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

  it("receita japonesa não conta: neo1 jp divide o set_id com o en e são outras cartas", () => {
    const porSet = colecoesPorSet([colecaoSet("neo-jp", ["neo1"], null, "jp"), colecaoSet("neo-en", ["neo2"], null, "en")]);
    expect(porSet.has("neo1")).toBe(false);
    expect(porSet.get("neo2")?.map((c) => c.id)).toEqual(["neo-en"]);
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
  it("guarda a série da prévia e apara os nomes", () => {
    expect(lerPedidoFaltantes({ serieId: "me", sets: [{ setId: "a", nome: " A " }] })).toEqual({
      ok: true,
      valor: { serieId: "me", sets: [{ setId: "a", nome: "A" }] },
    });
  });

  it("sem a série da prévia é corpo malformado", () => {
    const r = lerPedidoFaltantes({ sets: [{ setId: "a", nome: "A" }] });
    expect(!r.ok && "erro" in r).toBe(true);
  });

  it("vazio ou acima do teto é recusa com chave", () => {
    const vazio = lerPedidoFaltantes({ serieId: "me", sets: [] });
    expect(!vazio.ok && "recusa" in vazio && vazio.recusa.chave).toBe("quantidadeDeSetsParaCriarInvalida");
    const muitos = Array.from({ length: MAXIMO_SETS_POR_CRIACAO + 1 }, (_, i) => ({ setId: `s${i}`, nome: "n" }));
    expect(lerPedidoFaltantes({ serieId: "me", sets: muitos }).ok).toBe(false);
  });

  it("set repetido e nome vazio são recusas com chave", () => {
    const repetido = lerPedidoFaltantes({
      serieId: "me",
      sets: [
        { setId: "a", nome: "A" },
        { setId: "a", nome: "B" },
      ],
    });
    expect(!repetido.ok && "recusa" in repetido && repetido.recusa).toEqual({
      chave: "setRepetidoNoPedido",
      valores: { setId: "a" },
    });
    const semNome = lerPedidoFaltantes({ serieId: "me", sets: [{ setId: "a", nome: "  " }] });
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

describe("selecionarExistentes — só receita ocidental", () => {
  it("coleção japonesa do mesmo set_id não é candidata a entrar no grupo da série ocidental", () => {
    const r = selecionarExistentes(
      [colecaoSet("neo-jp", ["neo1"], null, "jp"), colecaoSet("neo-en", ["neo1", "neo2"], null, "en")],
      new Set(["neo1"]),
      "g",
      new Map(),
    );
    expect(r.map((c) => c.id)).toEqual(["neo-en"]);
  });
});

describe("conferirPedidoExistentes", () => {
  const candidatas = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const grupoAtual = new Map<string, string | null>([
    ["a", null],
    ["b", "g-outro"],
    ["c", null],
    ["no-alvo", "g-alvo"],
  ]);
  const item = (id: string, grupoOrigemId: string | null = null) => ({ id, grupoOrigemId });

  it("devolve os pedidos na ordem dos candidatos (a da lista)", () => {
    expect(conferirPedidoExistentes([item("c"), item("a")], candidatas, grupoAtual)).toEqual({
      ok: true,
      ids: ["a", "c"],
    });
  });

  it("tirar de outro grupo passa quando a prévia mostrou esse grupo", () => {
    expect(conferirPedidoExistentes([item("b", "g-outro")], candidatas, grupoAtual)).toEqual({ ok: true, ids: ["b"] });
  });

  it("coleção que outra aba pôs num grupo depois da prévia recusa o lote inteiro (409)", () => {
    // A prévia mostrou "b" sem grupo; hoje ela está em g-outro: tirá-la de lá
    // seria uma escolha que o usuário não viu.
    const r = conferirPedidoExistentes([item("a"), item("b", null)], candidatas, grupoAtual);
    expect(!r.ok && r.recusa.chave).toBe("ordemDeColecoesDesatualizada");
  });

  it("coleção excluída depois da prévia recusa o lote inteiro (409)", () => {
    const r = conferirPedidoExistentes([item("sumiu")], candidatas, grupoAtual);
    expect(!r.ok && r.recusa.chave).toBe("ordemDeColecoesDesatualizada");
  });

  it("no mesmo grupo, mas fora dos candidatos, recusa tudo", () => {
    const r = conferirPedidoExistentes(
      [item("a"), item("z")],
      candidatas,
      new Map([...grupoAtual, ["z", null]]),
    );
    expect(!r.ok && r.recusa.chave).toBe("colecaoForaDasExistentesDoGrupo");
  });
});
