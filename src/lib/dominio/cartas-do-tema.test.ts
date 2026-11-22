import { describe, expect, it } from "vitest";

import {
  MAXIMO_COPIAS_POR_LOTE_TEMA,
  conferirPedidoComEstado,
  contarCartasNovas,
  filtrarCopiasDoTema,
  lerPedidoCartasDoTema,
  marcarUmaPorCarta,
  ordenarCartasDoTema,
  type CopiaLivreParaTema,
  type EstadoCopiaDoPedido,
} from "./cartas-do-tema";

// Dados inventados: ids, sets e datas fictícios.
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

let seq = 0;
function copia(parcial: Partial<CopiaLivreParaTema> = {}): CopiaLivreParaTema {
  seq++;
  return {
    copiaId: `copia-${String(seq).padStart(3, "0")}`,
    cartaId: "fic1-001",
    idiomaCatalogo: "pt",
    setId: "fic1",
    setLancamento: "2025-01-10",
    localId: "001",
    criadoEm: "2026-01-01T00:00:00.000Z",
    foraDePadrao: false,
    dexIds: [25],
    tipos: ["Lightning"],
    ilustrador: null,
    raridade: null,
    raridadeEn: null,
    forma: "normal",
    ...parcial,
  };
}

describe("filtrarCopiasDoTema", () => {
  it("só as que cabem no tema, e só linhas ocidentais", () => {
    const dentro = copia();
    const fora = copia({ dexIds: [26] });
    const japonesa = copia({ idiomaCatalogo: "jp" });
    expect(filtrarCopiasDoTema([dentro, fora, japonesa], { tipo: "especie", valor: "25" })).toEqual([dentro]);
  });
});

describe("ordenarCartasDoTema", () => {
  it("set mais antigo primeiro, sem data por último, depois o número natural", () => {
    const a = copia({ setId: "b", setLancamento: "2024-01-01", localId: "10", cartaId: "b-10" });
    const b = copia({ setId: "b", setLancamento: "2024-01-01", localId: "9", cartaId: "b-9" });
    const c = copia({ setId: "a", setLancamento: null, localId: "1", cartaId: "a-1" });
    const d = copia({ setId: "c", setLancamento: "2023-01-01", localId: "1", cartaId: "c-1" });
    expect(ordenarCartasDoTema([a, b, c, d]).map((x) => x.cartaId)).toEqual(["c-1", "b-9", "b-10", "a-1"]);
  });

  it("na mesma carta, a do padrão antes da fora dele, e a mais antiga antes da nova", () => {
    const nova = copia({ criadoEm: "2026-02-01T00:00:00.000Z" });
    const antiga = copia({ criadoEm: "2026-01-01T00:00:00.000Z" });
    const foraDoPadrao = copia({ criadoEm: "2025-01-01T00:00:00.000Z", foraDePadrao: true });
    expect(ordenarCartasDoTema([nova, foraDoPadrao, antiga])).toEqual([antiga, nova, foraDoPadrao]);
  });
});

describe("marcarUmaPorCarta", () => {
  it("marca uma cópia por carta física, nunca duas", () => {
    const lista = marcarUmaPorCarta(
      [copia({ cartaId: "x" }), copia({ cartaId: "x" }), copia({ cartaId: "y" })],
      new Set(),
    );
    expect(lista.map((c) => c.marcadaPorPadrao)).toEqual([true, false, true]);
  });

  it("não marca cópia fora do padrão nem carta que a coleção já tem", () => {
    const lista = marcarUmaPorCarta(
      [copia({ cartaId: "x", foraDePadrao: true }), copia({ cartaId: "x" }), copia({ cartaId: "y" })],
      new Set(["y"]),
    );
    expect(lista.map((c) => [c.marcadaPorPadrao, c.jaNaColecao])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
    expect(contarCartasNovas(lista)).toBe(1);
  });
});

describe("lerPedidoCartasDoTema", () => {
  const item = (copiaId: string, quantidade = 1, jaNaColecao = false) => ({ copiaId, quantidade, jaNaColecao });

  it("aceita de 1 ao teto, canoniza os ids e lê o que a prévia mostrou", () => {
    expect(
      lerPedidoCartasDoTema({ itens: [item(UUID_A.toUpperCase(), 2), item(UUID_B, 1, true)], permitirForaDePadrao: true }),
    ).toEqual({
      ok: true,
      valor: { itens: [item(UUID_A, 2), item(UUID_B, 1, true)], permitirForaDePadrao: true },
    });
  });

  it("recusa com chave: lista vazia ou acima do teto, item malformado, cópia repetida", () => {
    expect(lerPedidoCartasDoTema({ itens: [] })).toEqual({
      ok: false,
      recusa: { chave: "quantidadeDeCartasDoTemaInvalida", valores: { maximo: String(MAXIMO_COPIAS_POR_LOTE_TEMA) } },
    });
    const demais = Array.from({ length: MAXIMO_COPIAS_POR_LOTE_TEMA + 1 }, () => item(UUID_A));
    expect(lerPedidoCartasDoTema({ itens: demais }).ok).toBe(false);
    expect(lerPedidoCartasDoTema({ itens: [item(UUID_A), item(UUID_A.toUpperCase())] })).toEqual({
      ok: false,
      recusa: { chave: "copiaRepetidaNoPedido" },
    });
    const invalido = { ok: false, recusa: { chave: "pedidoDeCartasDoTemaInvalido" } };
    expect(lerPedidoCartasDoTema({ itens: [item("x")] })).toEqual(invalido);
    expect(lerPedidoCartasDoTema({ itens: [item(UUID_A, 0)] })).toEqual(invalido);
    expect(lerPedidoCartasDoTema({ itens: [{ copiaId: UUID_A, quantidade: 1 }] })).toEqual(invalido);
    expect(lerPedidoCartasDoTema({})).toEqual(invalido);
  });

  it("o formato antigo, só com os ids, é recusado: ele não diz o que a prévia mostrou", () => {
    expect(lerPedidoCartasDoTema({ copiaIds: [UUID_A] })).toEqual({
      ok: false,
      recusa: { chave: "pedidoDeCartasDoTemaInvalido" },
    });
  });
});

describe("conferirPedidoComEstado", () => {
  const tema = { tipo: "especie" as const, valor: "25" };
  const estado = (parcial: Partial<EstadoCopiaDoPedido> = {}): EstadoCopiaDoPedido => ({
    cartaId: "fic1-001",
    idiomaCatalogo: "pt",
    quantidade: 2,
    dexIds: [25],
    tipos: [],
    ilustrador: null,
    raridade: null,
    raridadeEn: null,
    forma: "normal",
    ...parcial,
  });

  it("passa quando o estado é o que a prévia mostrou", () => {
    const r = conferirPedidoComEstado(
      [{ copiaId: UUID_A, quantidade: 2, jaNaColecao: false }],
      new Map([[UUID_A, estado()]]),
      new Set(),
      tema,
    );
    expect(r).toBeNull();
  });

  it("duas abas, lote de 2: a segunda vê outra quantidade e o lote inteiro é velho (409)", () => {
    // A primeira aba dividiu o lote: o id original ficou livre, com 1 unidade.
    const r = conferirPedidoComEstado(
      [{ copiaId: UUID_A, quantidade: 2, jaNaColecao: false }],
      new Map([[UUID_A, estado({ quantidade: 1 })]]),
      new Set(["fic1-001"]),
      tema,
    );
    expect(r).toEqual({ recusa: { chave: "cartasDoTemaDesatualizadas" }, status: 409 });
  });

  it("carta que entrou na coleção depois da prévia recusa; a que a prévia já mostrava como presente, não", () => {
    const estadoAtual = new Map([[UUID_A, estado({ quantidade: 1 })]]);
    const naColecao = new Set(["fic1-001"]);
    expect(conferirPedidoComEstado([{ copiaId: UUID_A, quantidade: 1, jaNaColecao: false }], estadoAtual, naColecao, tema))
      .toEqual({ recusa: { chave: "cartasDoTemaDesatualizadas" }, status: 409 });
    expect(conferirPedidoComEstado([{ copiaId: UUID_A, quantidade: 1, jaNaColecao: true }], estadoAtual, naColecao, tema))
      .toBeNull();
  });

  it("cópia que sumiu é 409; cópia fora do tema ou de linha japonesa é 400", () => {
    const pedido = [{ copiaId: UUID_A, quantidade: 2, jaNaColecao: false }];
    expect(conferirPedidoComEstado(pedido, new Map(), new Set(), tema)).toEqual({
      recusa: { chave: "copiaNaoEncontrada" },
      status: 409,
    });
    expect(conferirPedidoComEstado(pedido, new Map([[UUID_A, estado({ dexIds: [26] })]]), new Set(), tema)).toEqual({
      recusa: { chave: "copiaForaDoTema" },
      status: 400,
    });
    expect(conferirPedidoComEstado(pedido, new Map([[UUID_A, estado({ idiomaCatalogo: "jp" })]]), new Set(), tema))
      .toEqual({ recusa: { chave: "copiaForaDoTema" }, status: 400 });
  });
});
