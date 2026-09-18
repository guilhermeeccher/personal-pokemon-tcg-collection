import { describe, expect, it } from "vitest";

import { decidirInativacaoCatalogo } from "./inativacao-catalogo";

describe("decidirInativacaoCatalogo", () => {
  it("rodada limpa inativa normalmente, sem exclusões", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 10,
      setsComFalha: [],
      cartasComErro: [],
    });

    expect(decisao).toEqual({ deveInativar: true, setsExcluidos: [] });
  });

  it("set com falha em obterSet fica de fora da inativação", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 10,
      setsComFalha: ["swsh1"],
      cartasComErro: [],
    });

    expect(decisao.deveInativar).toBe(true);
    expect(decisao.setsExcluidos).toEqual(["swsh1"]);
  });

  it("carta com erro em obterCarta exclui só o set dela, não os outros", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 10,
      setsComFalha: [],
      cartasComErro: [{ setId: "swsh1" }, { setId: "swsh1" }],
    });

    expect(decisao.deveInativar).toBe(true);
    expect(decisao.setsExcluidos).toEqual(["swsh1"]);
  });

  it("combina setsComFalha e cartasComErro sem duplicar", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 10,
      setsComFalha: ["swsh1"],
      cartasComErro: [{ setId: "swsh1" }, { setId: "swsh2" }],
    });

    expect(decisao.deveInativar).toBe(true);
    expect(decisao.setsExcluidos.sort()).toEqual(["swsh1", "swsh2"]);
  });

  it("rodada 100% vazia não inativa nada, mesmo sem falhas registradas", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 0,
      setsComFalha: [],
      cartasComErro: [],
    });

    expect(decisao).toEqual({ deveInativar: false, setsExcluidos: [] });
  });
});

describe("sync incremental — sets pulados", () => {
  it("nunca inativa carta de set que o incremental pulou", () => {
    // O acidente que este teste torna impossível: com o incremental, as
    // cartas de um set inalterado não passam pelo upsert. Se elas caíssem no
    // UPDATE por relógio, uma rodada normal inativaria o catálogo inteiro em
    // silêncio — e há cópias reais do usuário apontando para essas linhas.
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 12,
      setsComFalha: [],
      cartasComErro: [],
      totalCartasRevalidadas: 13_861,
      setsPulados: ["base1", "mep", "SM3H"],
    });

    expect(decisao.deveInativar).toBe(true);
    expect(decisao.setsExcluidos).toEqual(
      expect.arrayContaining(["base1", "mep", "SM3H"]),
    );
  });

  it("rodada em que todo set estava inalterado não é rodada vazia", () => {
    // Nenhuma carta upsertada, mas o catálogo foi enxergado por completo:
    // difere de "API fora do ar", que não pode inativar nada.
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 0,
      setsComFalha: [],
      cartasComErro: [],
      totalCartasRevalidadas: 13_873,
      setsPulados: ["base1"],
    });
    expect(decisao.deveInativar).toBe(true);
  });

  it("rodada sem upsert e sem revalidação segue sendo rodada vazia", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 0,
      setsComFalha: ["base1"],
      cartasComErro: [],
      totalCartasRevalidadas: 0,
      setsPulados: [],
    });
    expect(decisao.deveInativar).toBe(false);
  });

  it("soma sets pulados aos que já eram excluídos por falha", () => {
    const decisao = decidirInativacaoCatalogo({
      totalCartasSincronizadas: 5,
      setsComFalha: ["sv01"],
      cartasComErro: [{ setId: "sv02" }],
      totalCartasRevalidadas: 100,
      setsPulados: ["base1"],
    });
    expect([...decisao.setsExcluidos].sort()).toEqual(["base1", "sv01", "sv02"]);
  });
});
