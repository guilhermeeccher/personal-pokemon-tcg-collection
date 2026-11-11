import { describe, expect, it } from "vitest";

import { fotografarPrecos } from "./historico-precos";
import {
  comoPrecoDeCarta,
  converterParaReais,
  converterPrecoCardmarket,
  cotacaoMaisRecente,
  escolherValorCardmarket,
  extrairPrecoCardmarket,
  idiomasDeConsulta,
  LIMITE_TENDENCIA_SOBRE_MEDIA30,
  type PrecoCardmarket,
} from "./preco-cardmarket";
import { compararPorValorDesc, resumirPrecos } from "./precos-cartas-especiais";

/** Um `pricing` inventado, no formato da TCGdex. */
function pricing(cardmarket: Record<string, unknown> | null) {
  return { cardmarket, tcgplayer: { unit: "USD" } };
}

describe("extrairPrecoCardmarket", () => {
  it("lê tendência, média, mínimo e média de 30 dias sem foil, com produto e data", () => {
    const r = extrairPrecoCardmarket(
      pricing({
        updated: "2026-01-02T03:04:05.000Z",
        unit: "EUR",
        idProduct: 1234,
        trend: 2.5,
        avg: 3,
        low: 1.2,
        avg30: 2.8,
        "trend-holo": 9,
        "avg-holo": 9,
        "low-holo": 9,
        "avg30-holo": 9,
      }),
    );
    expect(r).toEqual({
      idProduto: 1234,
      tendenciaEur: 2.5,
      mediaEur: 3,
      minimoEur: 1.2,
      media30Eur: 2.8,
      foil: false,
      atualizadoEm: new Date("2026-01-02T03:04:05.000Z"),
    });
  });

  it("sem tendência e sem média normais, usa os campos -holo (com avg30-holo) e marca foil", () => {
    const r = extrairPrecoCardmarket(
      pricing({ trend: 0, low: 0.5, avg30: 8, "trend-holo": 4, "avg-holo": 5, "low-holo": 3, "avg30-holo": 4.5 }),
    );
    expect(r).toMatchObject({ tendenciaEur: 4, mediaEur: 5, minimoEur: 3, media30Eur: 4.5, foil: true });
  });

  it("a média de 30 dias vem só do conjunto escolhido, e ausente vale null", () => {
    // Conjunto sem foil escolhido: o avg30-holo não freia a tendência normal.
    expect(extrairPrecoCardmarket(pricing({ trend: 2, "avg30-holo": 1 }))?.media30Eur).toBeNull();
    // Conjunto foil escolhido: o avg30 normal não freia a tendência foil.
    expect(extrairPrecoCardmarket(pricing({ avg30: 1, "trend-holo": 2 }))?.media30Eur).toBeNull();
    for (const ruim of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, "3"]) {
      expect(extrairPrecoCardmarket(pricing({ trend: 2, avg30: ruim }))?.media30Eur).toBeNull();
    }
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

describe("escolherValorCardmarket", () => {
  it("o limite é 3× a média de 30 dias", () => {
    expect(LIMITE_TENDENCIA_SOBRE_MEDIA30).toBe(3);
  });

  it("tendência dentro do limite é o valor", () => {
    expect(escolherValorCardmarket({ tendenciaEur: 5, mediaEur: 4, media30Eur: 4.5 })).toEqual({
      valorEur: 5,
      criterio: "tendencia",
    });
  });

  it("sem média de 30 dias, a tendência vale como está, por maior que seja", () => {
    expect(escolherValorCardmarket({ tendenciaEur: 500, mediaEur: 1, media30Eur: null })).toEqual({
      valorEur: 500,
      criterio: "tendencia",
    });
  });

  it("tendência acima de 3× a média de 30 dias: vale a média de 30 dias", () => {
    expect(escolherValorCardmarket({ tendenciaEur: 31, mediaEur: 2, media30Eur: 3 })).toEqual({
      valorEur: 3,
      criterio: "media30",
    });
    // Um centavo acima da fronteira já trava.
    expect(escolherValorCardmarket({ tendenciaEur: 9.01, mediaEur: 2, media30Eur: 3 })).toEqual({
      valorEur: 3,
      criterio: "media30",
    });
  });

  it("exatamente 3× fica na tendência, também onde o ponto flutuante erraria", () => {
    expect(escolherValorCardmarket({ tendenciaEur: 9, mediaEur: 2, media30Eur: 3 })).toEqual({
      valorEur: 9,
      criterio: "tendencia",
    });
    // 3 × 2,15 dá 6,449999… em ponto flutuante: a conta é em centavos.
    expect(escolherValorCardmarket({ tendenciaEur: 6.45, mediaEur: null, media30Eur: 2.15 })).toEqual({
      valorEur: 6.45,
      criterio: "tendencia",
    });
    expect(escolherValorCardmarket({ tendenciaEur: 3.3, mediaEur: null, media30Eur: 1.1 })?.criterio).toBe(
      "tendencia",
    );
  });

  it("sem tendência, com média: a média (a média de 30 dias não entra)", () => {
    expect(escolherValorCardmarket({ tendenciaEur: null, mediaEur: 2, media30Eur: 50 })).toEqual({
      valorEur: 2,
      criterio: "media",
    });
  });

  it("sem tendência e sem média, null — a média de 30 dias sozinha não basta", () => {
    expect(escolherValorCardmarket({ tendenciaEur: null, mediaEur: null, media30Eur: 4 })).toBeNull();
    expect(escolherValorCardmarket({ tendenciaEur: null, mediaEur: null, media30Eur: null })).toBeNull();
  });

  it("zero, negativo e não finito valem como ausentes", () => {
    expect(escolherValorCardmarket({ tendenciaEur: 5, mediaEur: null, media30Eur: 0 })).toEqual({
      valorEur: 5,
      criterio: "tendencia",
    });
    expect(escolherValorCardmarket({ tendenciaEur: 0, mediaEur: 2, media30Eur: null })).toEqual({
      valorEur: 2,
      criterio: "media",
    });
    expect(
      escolherValorCardmarket({ tendenciaEur: Number.NaN, mediaEur: -1, media30Eur: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it("a carta foil passa pela mesma trava, com a média de 30 dias da versão foil", () => {
    const foil = extrairPrecoCardmarket(
      pricing({ avg30: 100, "trend-holo": 40, "avg-holo": 4, "avg30-holo": 6 }),
    );
    expect(foil?.foil).toBe(true);
    expect(escolherValorCardmarket(foil!)).toEqual({ valorEur: 6, criterio: "media30" });
    const foilNoLimite = extrairPrecoCardmarket(pricing({ "trend-holo": 18, "avg30-holo": 6 }));
    expect(escolherValorCardmarket(foilNoLimite!)).toEqual({ valorEur: 18, criterio: "tendencia" });
  });
});

describe("converterPrecoCardmarket", () => {
  const base: PrecoCardmarket = {
    idProduto: 1,
    tendenciaEur: 40,
    mediaEur: 4,
    minimoEur: 1,
    media30Eur: 7,
    foil: false,
    atualizadoEm: null,
  };

  it("converte tudo pela cotação e guarda o valor escolhido em euro e em reais", () => {
    expect(converterPrecoCardmarket(base, 6)).toEqual({
      tendencia: 240,
      media: 24,
      minimo: 6,
      media30: 42,
      valorEur: 7,
      valor: 42,
      criterioValor: "media30",
    });
  });

  it("o valor em reais é sempre igual à coluna de onde veio, centavo a centavo", () => {
    const r = converterPrecoCardmarket({ ...base, tendenciaEur: 2.37, media30Eur: 2 }, 6.1706);
    expect(r.criterioValor).toBe("tendencia");
    expect(r.valor).toBe(r.tendencia);
    const m = converterPrecoCardmarket({ ...base, tendenciaEur: null, mediaEur: 3.33 }, 6.1706);
    expect(m.criterioValor).toBe("media");
    expect(m.valor).toBe(m.media);
  });

  it("consulta sem preço guarda tudo nulo", () => {
    expect(converterPrecoCardmarket(null, 6)).toEqual({
      tendencia: null,
      media: null,
      minimo: null,
      media30: null,
      valorEur: null,
      valor: null,
      criterioValor: null,
    });
  });
});

describe("comoPrecoDeCarta", () => {
  it("no agregador, o médio é o valor guardado e o mínimo é o low", () => {
    expect(comoPrecoDeCarta({ encontrada: true, minimo: 5, media: 20, valor: 10 })).toEqual({
      encontrada: true,
      preco: 5,
      precoMedio: 10,
      precoMaximo: 20,
    });
  });

  it("o resumo, a foto e a ordem usam o valor guardado, não a tendência", () => {
    // A segunda linha travou na média de 30 dias: a tendência dela (que nem
    // chega aqui) era maior, mas o que soma e ordena é o valor guardado.
    const linhas = [
      { encontrada: true, minimo: 5, media: 20, valor: 10 },
      { encontrada: true, minimo: 1, media: 3, valor: 4 },
      { encontrada: true, minimo: 2, media: 12, valor: 12 },
      { encontrada: false, minimo: null, media: null, valor: null },
    ];
    const precos = linhas.map(comoPrecoDeCarta);
    expect(resumirPrecos(precos)).toEqual({ cartasComPreco: 3, naoEncontradas: 1, somaMedios: 26 });
    expect(fotografarPrecos(precos)).toMatchObject({ somaMedios: 26, cartasComPreco: 3, somaMinimos: 8 });
    expect([...precos].sort(compararPorValorDesc).map((p) => p.precoMedio)).toEqual([12, 10, 4, null]);
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
