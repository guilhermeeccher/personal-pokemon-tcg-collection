import { describe, expect, it } from "vitest";

import { fotografarPrecos } from "./historico-precos";
import {
  comoPrecoDeCarta,
  converterParaReais,
  cotacaoMaisRecente,
  extrairPrecoCardmarket,
  idiomasDeConsulta,
  valorCardmarket,
} from "./preco-cardmarket";
import { compararPorValorDesc, resumirPrecos } from "./precos-cartas-especiais";

/** Um `pricing` inventado, no formato da TCGdex. */
function pricing(cardmarket: Record<string, unknown> | null) {
  return { cardmarket, tcgplayer: { unit: "USD" } };
}

describe("extrairPrecoCardmarket", () => {
  it("lê tendência, média e mínimo sem foil, com produto e data", () => {
    const r = extrairPrecoCardmarket(
      pricing({
        updated: "2026-01-02T03:04:05.000Z",
        unit: "EUR",
        idProduct: 1234,
        trend: 2.5,
        avg: 3,
        low: 1.2,
        "trend-holo": 9,
        "avg-holo": 9,
        "low-holo": 9,
      }),
    );
    expect(r).toEqual({
      idProduto: 1234,
      tendenciaEur: 2.5,
      mediaEur: 3,
      minimoEur: 1.2,
      foil: false,
      atualizadoEm: new Date("2026-01-02T03:04:05.000Z"),
    });
  });

  it("sem tendência e sem média normais, usa os campos -holo e marca foil", () => {
    const r = extrairPrecoCardmarket(
      pricing({ trend: 0, low: 0.5, "trend-holo": 4, "avg-holo": 5, "low-holo": 3 }),
    );
    expect(r).toMatchObject({ tendenciaEur: 4, mediaEur: 5, minimoEur: 3, foil: true });
  });

  it("uma só (tendência ou média) basta para ficar nos campos normais", () => {
    expect(extrairPrecoCardmarket(pricing({ avg: 2, "trend-holo": 7 }))).toMatchObject({
      tendenciaEur: null,
      mediaEur: 2,
      foil: false,
    });
    expect(extrairPrecoCardmarket(pricing({ trend: 2, "avg-holo": 7 }))).toMatchObject({
      tendenciaEur: 2,
      mediaEur: null,
      foil: false,
    });
  });

  it("zero, negativo, não finito, null e texto valem como ausentes", () => {
    const r = extrairPrecoCardmarket(
      pricing({ trend: 0, avg: -1, low: Number.NaN, "trend-holo": null, "avg-holo": "3", "low-holo": Infinity }),
    );
    expect(r).toBeNull();
    expect(
      extrairPrecoCardmarket(pricing({ trend: 1, avg: Number.POSITIVE_INFINITY, low: 0 })),
    ).toMatchObject({ tendenciaEur: 1, mediaEur: null, minimoEur: null });
  });

  it("sem tendência e sem média em lugar nenhum, devolve null (mínimo sozinho não basta)", () => {
    expect(extrairPrecoCardmarket(pricing({ low: 1, "low-holo": 2 }))).toBeNull();
  });

  it("entrada que não é objeto, ou sem cardmarket, devolve null", () => {
    for (const entrada of [null, undefined, 3, "x", [], {}, pricing(null), { cardmarket: [] }]) {
      expect(extrairPrecoCardmarket(entrada)).toBeNull();
    }
  });

  it("unidade que não é euro devolve null; ausente vale como euro", () => {
    expect(extrairPrecoCardmarket(pricing({ unit: "USD", trend: 2 }))).toBeNull();
    expect(extrairPrecoCardmarket(pricing({ trend: 2 }))).toMatchObject({ tendenciaEur: 2 });
  });

  it("produto e data inválidos viram null sem derrubar o preço", () => {
    expect(
      extrairPrecoCardmarket(pricing({ trend: 2, idProduct: "12", updated: "ontem" })),
    ).toMatchObject({ idProduto: null, atualizadoEm: null, tendenciaEur: 2 });
    expect(extrairPrecoCardmarket(pricing({ trend: 2, idProduct: 1.5 }))?.idProduto).toBeNull();
  });
});

describe("converterParaReais", () => {
  it("multiplica pela cotação e arredonda a centavos", () => {
    expect(converterParaReais(10, 6.2345)).toBe(62.35);
    expect(converterParaReais(0.09, 6.2345)).toBe(0.56);
    expect(converterParaReais(1.5, 5)).toBe(7.5);
  });

  it("ausente continua ausente", () => {
    expect(converterParaReais(null, 6)).toBeNull();
  });

  it("cotação inválida estoura em vez de gravar preço errado", () => {
    for (const c of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => converterParaReais(1, c)).toThrow();
    }
  });
});

describe("valorCardmarket e comoPrecoDeCarta", () => {
  it("o valor é a tendência; sem ela, a média", () => {
    expect(valorCardmarket({ tendencia: 10, media: 20 })).toBe(10);
    expect(valorCardmarket({ tendencia: null, media: 20 })).toBe(20);
    expect(valorCardmarket({ tendencia: null, media: null })).toBeNull();
  });

  it("no agregador, o médio é a tendência e o mínimo é o low", () => {
    expect(comoPrecoDeCarta({ encontrada: true, minimo: 5, tendencia: 10, media: 20 })).toEqual({
      encontrada: true,
      preco: 5,
      precoMedio: 10,
      precoMaximo: 20,
    });
    expect(comoPrecoDeCarta({ encontrada: true, minimo: null, tendencia: null, media: 20 })).toMatchObject({
      precoMedio: 20,
    });
  });

  it("o resumo e a foto somam as tendências; a ordem segue o mesmo valor", () => {
    const linhas = [
      { encontrada: true, minimo: 5, tendencia: 10, media: 20 },
      { encontrada: true, minimo: 1, tendencia: null, media: 3 },
      { encontrada: false, minimo: null, tendencia: null, media: null },
    ];
    const precos = linhas.map(comoPrecoDeCarta);
    expect(resumirPrecos(precos)).toEqual({ cartasComPreco: 2, naoEncontradas: 1, somaMedios: 13 });
    expect(fotografarPrecos(precos)).toMatchObject({ somaMedios: 13, cartasComPreco: 2, somaMinimos: 6 });
    expect([...precos].sort(compararPorValorDesc).map((p) => p.precoMedio)).toEqual([10, 3, null]);
  });
});

describe("idiomasDeConsulta", () => {
  it("pergunta en, pt, jp, só nos idiomas que a carta tem", () => {
    expect(idiomasDeConsulta(["pt", "en"])).toEqual(["en", "pt"]);
    expect(idiomasDeConsulta(["jp", "pt", "en"])).toEqual(["en", "pt", "jp"]);
    expect(idiomasDeConsulta(["pt"])).toEqual(["pt"]);
    expect(idiomasDeConsulta(["jp"])).toEqual(["jp"]);
    expect(idiomasDeConsulta([])).toEqual([]);
  });
});

describe("cotacaoMaisRecente", () => {
  it("é a da linha encontrada consultada por último; as não encontradas não contam", () => {
    const r = cotacaoMaisRecente([
      { encontrada: true, cotacao: 6.1, cotacaoData: "2026-01-01", consultadoEm: new Date("2026-01-01T12:00:00Z") },
      { encontrada: true, cotacao: 6.3, cotacaoData: "2026-01-03", consultadoEm: new Date("2026-01-03T12:00:00Z") },
      { encontrada: false, cotacao: null, cotacaoData: null, consultadoEm: new Date("2026-01-05T12:00:00Z") },
      { encontrada: true, cotacao: 6.2, cotacaoData: "2026-01-02", consultadoEm: new Date("2026-01-02T12:00:00Z") },
    ]);
    expect(r).toEqual({ valor: 6.3, data: "2026-01-03" });
  });

  it("sem nenhuma encontrada, null", () => {
    expect(cotacaoMaisRecente([])).toBeNull();
    expect(
      cotacaoMaisRecente([
        { encontrada: false, cotacao: null, cotacaoData: null, consultadoEm: new Date() },
      ]),
    ).toBeNull();
  });
});
