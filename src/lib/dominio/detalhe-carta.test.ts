import { describe, expect, it } from "vitest";

import {
  cartaTemPrecoDeInventario,
  escolherFichaDoDetalhe,
  raridadeCanonicaDaFicha,
  PONTOS_SERIE_CURTA,
  precoDoDetalhe,
  serieCurta,
  type LinhaPrecoCardmarket,
} from "./detalhe-carta";

// Dados inventados: nenhum preço, data ou carta vem de uma coleção real.

const cardmarket = (sobrescrever: Partial<LinhaPrecoCardmarket>): LinhaPrecoCardmarket => ({
  encontrada: true,
  valor: 120,
  valorEur: 20,
  criterioValor: "tendencia",
  tendenciaEur: 20,
  cotacao: 6,
  cotacaoData: "2026-11-20",
  em: new Date("2026-11-21T00:00:00Z"),
  ...sobrescrever,
});

const entrada = (sobrescrever: Partial<Parameters<typeof precoDoDetalhe>[0]>) => ({
  fonte: "cardmarket" as const,
  possuida: true,
  especial: true,
  inventarioCardmarket: null,
  inventarioLiga: null,
  candidataCardmarket: null,
  ...sobrescrever,
});

describe("escolherFichaDoDetalhe", () => {
  const fichas = [{ idioma: "jp" as const }, { idioma: "en" as const }, { idioma: "pt" as const }];

  it("a pedida, quando existe; senão pt, en, jp", () => {
    expect(escolherFichaDoDetalhe(fichas, "en")?.idioma).toBe("en");
    expect(escolherFichaDoDetalhe(fichas, null)?.idioma).toBe("pt");
    expect(escolherFichaDoDetalhe([{ idioma: "jp" as const }], "pt")?.idioma).toBe("jp");
    expect(escolherFichaDoDetalhe([], null)).toBeUndefined();
  });
});

describe("cartaTemPrecoDeInventario", () => {
  it("uma ficha comum ou incomum tira a carta, mesmo que a outra não traga raridade", () => {
    expect(cartaTemPrecoDeInventario([{ setId: "xx", raridade: "Rara" }, { setId: "xx", raridade: null }])).toBe(true);
    expect(cartaTemPrecoDeInventario([{ setId: "xx", raridade: "Comum" }, { setId: "xx", raridade: null }])).toBe(false);
    expect(cartaTemPrecoDeInventario([{ setId: "30th-c", raridade: "Common" }])).toBe(true);
    expect(cartaTemPrecoDeInventario([])).toBe(false);
  });
});

describe("precoDoDetalhe", () => {
  it("possuída e especial: o preço do inventário na fonte ativa, com a cotação", () => {
    const r = precoDoDetalhe(entrada({ inventarioCardmarket: cardmarket({}) }));
    expect(r).toEqual({
      fonte: "cardmarket",
      origem: "inventario",
      preco: {
        fonte: "cardmarket",
        valor: 120,
        em: "2026-11-21T00:00:00.000Z",
        cardmarket: { valorEur: 20, criterioValor: "tendencia", cotacao: 6, cotacaoData: "2026-11-20" },
      },
    });
  });

  it("a tendência só vai quando foi trocada pela média de 30 dias", () => {
    const r = precoDoDetalhe(
      entrada({ inventarioCardmarket: cardmarket({ criterioValor: "media30", tendenciaEur: 99 }) }),
    );
    expect(r.preco?.cardmarket).toMatchObject({ criterioValor: "media30", tendenciaEur: 99 });
  });

  it("possuída comum: nunca tem preço, e diz por quê", () => {
    const r = precoDoDetalhe(entrada({ especial: false, inventarioCardmarket: cardmarket({}) }));
    expect(r).toEqual({ fonte: "cardmarket", origem: null, preco: null, motivo: "naoEspecial" });
  });

  it("possuída e especial sem linha: ainda não consultada; consultada sem preço: sem preço na fonte", () => {
    expect(precoDoDetalhe(entrada({})).motivo).toBe("naoConsultada");
    expect(precoDoDetalhe(entrada({ inventarioCardmarket: cardmarket({ encontrada: false, valor: null }) })).motivo).toBe(
      "semPrecoNaFonte",
    );
  });

  it("Liga: o médio, senão o menor, sem conversão, com os três números", () => {
    const r = precoDoDetalhe(
      entrada({
        fonte: "liga",
        inventarioLiga: { encontrada: true, minimo: 10, medio: null, maximo: 30, em: new Date("2026-11-01T00:00:00Z") },
        // A linha do Cardmarket nunca entra quando a fonte é a Liga.
        inventarioCardmarket: cardmarket({}),
      }),
    );
    expect(r).toEqual({
      fonte: "liga",
      origem: "inventario",
      preco: {
        fonte: "liga",
        valor: 10,
        em: "2026-11-01T00:00:00.000Z",
        liga: { minimo: 10, medio: null, maximo: 30 },
      },
    });
  });

  it("fora do inventário: o preço de candidata no Cardmarket; na Liga, nada", () => {
    expect(
      precoDoDetalhe(entrada({ possuida: false, candidataCardmarket: cardmarket({ valor: 7 }) })),
    ).toMatchObject({ origem: "candidata", preco: { valor: 7 } });
    expect(precoDoDetalhe(entrada({ possuida: false })).motivo).toBe("foraDoInventario");
    expect(
      precoDoDetalhe(entrada({ fonte: "liga", possuida: false, candidataCardmarket: cardmarket({}) })).motivo,
    ).toBe("foraDoInventario");
  });
});

describe("serieCurta", () => {
  it("sem histórico na régua (não possuída, ou comum): nula — nunca inventada", () => {
    expect(serieCurta("cardmarket", false, [{ em: new Date(0), encontrada: true, valor: 1 }])).toBeNull();
  });

  it("só os pontos com preço, do mais antigo ao mais novo, os mais recentes", () => {
    const linhas = Array.from({ length: PONTOS_SERIE_CURTA + 5 }, (_, i) => ({
      em: new Date(Date.UTC(2026, 0, 1 + i)),
      encontrada: i !== 3,
      valor: i,
    }));
    const s = serieCurta("liga", true, [...linhas].reverse());
    expect(s?.fonte).toBe("liga");
    expect(s?.pontos).toHaveLength(PONTOS_SERIE_CURTA);
    expect(s?.pontos[0].valor).toBe(5);
    expect(s?.pontos.at(-1)?.valor).toBe(PONTOS_SERIE_CURTA + 4);
    expect(serieCurta("liga", true, [{ em: new Date(0), encontrada: false, valor: null }])?.pontos).toEqual([]);
  });
});

describe("raridadeCanonicaDaFicha", () => {
  /* Fichas inventadas de uma carta só. */
  const pt = { idioma: "pt" as const, raridade: "Rara Dupla" };
  const en = { idioma: "en" as const, raridade: "Double rare" };
  const jp = { idioma: "jp" as const, raridade: "RR" };

  it("a ficha pt rotula pela raridade da ficha en do mesmo carta_id", () => {
    expect(raridadeCanonicaDaFicha(pt, [pt, en])).toBe("Double rare");
  });
  it("a ficha en é a própria canônica", () => {
    expect(raridadeCanonicaDaFicha(en, [pt, en])).toBe("Double rare");
  });
  it("sem ficha en, ou com a en sem raridade, fica a gravada", () => {
    expect(raridadeCanonicaDaFicha(pt, [pt])).toBe("Rara Dupla");
    expect(raridadeCanonicaDaFicha(pt, [pt, { idioma: "en" as const, raridade: null }])).toBe("Rara Dupla");
    expect(raridadeCanonicaDaFicha(pt, [pt, { idioma: "en" as const, raridade: "  " }])).toBe("Rara Dupla");
  });
  it("sem raridade em lugar nenhum, nula", () => {
    const semPt = { idioma: "pt" as const, raridade: null };
    expect(raridadeCanonicaDaFicha(semPt, [semPt])).toBeNull();
  });
  it("a ficha jp nunca toma a raridade da en (neo1 a neo4 dividem o id e são outras cartas)", () => {
    expect(raridadeCanonicaDaFicha(jp, [jp, en])).toBe("RR");
  });
});
