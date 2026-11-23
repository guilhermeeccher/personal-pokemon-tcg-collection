import { describe, expect, it } from "vitest";

import { fatiaDaDistribuicao, hrefInventario, percentualSemFechar, precoDaJoia } from "./visao-geral-v2";

describe("percentualSemFechar", () => {
  it("nunca arredonda para cima até fechar", () => {
    expect(percentualSemFechar(996, 1000)).toBe(99);
    expect(percentualSemFechar(199, 200)).toBe(99);
  });
  it("só fecha em 100 quando nada falta", () => {
    expect(percentualSemFechar(10, 10)).toBe(100);
    expect(percentualSemFechar(12, 10)).toBe(100);
  });
  it("trata total zero e valores fora da faixa", () => {
    expect(percentualSemFechar(0, 0)).toBe(0);
    expect(percentualSemFechar(5, -1)).toBe(0);
    expect(percentualSemFechar(-3, 10)).toBe(0);
    expect(percentualSemFechar(1, 3)).toBe(33);
  });
});

describe("fatiaDaDistribuicao", () => {
  it("é a razão entre unidades e total, entre 0 e 1", () => {
    expect(fatiaDaDistribuicao(1, 4)).toBe(0.25);
    expect(fatiaDaDistribuicao(9, 4)).toBe(1);
  });
  it("é zero sem total ou sem unidades", () => {
    expect(fatiaDaDistribuicao(3, 0)).toBe(0);
    expect(fatiaDaDistribuicao(0, 3)).toBe(0);
    expect(fatiaDaDistribuicao(Number.NaN, 3)).toBe(0);
  });
});

describe("hrefInventario", () => {
  it("usa as chaves que o inventário já lê", () => {
    expect(hrefInventario()).toBe("/inventario");
    expect(hrefInventario({ chave: "alocacao", valor: "livre" })).toBe("/inventario?alocacao=livre");
    expect(hrefInventario({ chave: "idioma", valor: "jp" })).toBe("/inventario?idioma=jp");
  });
  it("codifica o valor sem perder nada", () => {
    expect(hrefInventario({ chave: "raridade", valor: "Rara Holo & Dupla" })).toBe(
      "/inventario?raridade=Rara%20Holo%20%26%20Dupla",
    );
    expect(hrefInventario({ chave: "set", valor: "sv03.5" })).toBe("/inventario?set=sv03.5");
  });
});

describe("precoDaJoia", () => {
  it("sem valor não há preço (nunca R$ 0)", () => {
    expect(precoDaJoia("liga", null, undefined)).toBeNull();
    expect(precoDaJoia("cardmarket", null, { valorEur: 1, cotacao: 6, cotacaoData: "2026-11-20" })).toBeNull();
    expect(precoDaJoia("liga", Number.NaN, undefined)).toBeNull();
  });
  it("na Liga o valor segue em reais, sem euro nem cotação", () => {
    expect(precoDaJoia("liga", 12.5, { valorEur: 2, cotacao: 6, cotacaoData: "2026-11-20" })).toEqual({
      fonte: "liga",
      valor: 12.5,
    });
  });
  it("no Cardmarket leva a fonte, o euro, a cotação e o dia dela", () => {
    expect(precoDaJoia("cardmarket", 130, { valorEur: 21.5, cotacao: 6.05, cotacaoData: "2026-11-20" })).toEqual({
      fonte: "cardmarket",
      valor: 130,
      valorEur: 21.5,
      cotacao: 6.05,
      cotacaoData: "2026-11-20",
    });
  });
  it("no Cardmarket sem a linha de origem ainda mostra o valor, sem inventar cotação", () => {
    expect(precoDaJoia("cardmarket", 130, undefined)).toEqual({
      fonte: "cardmarket",
      valor: 130,
      valorEur: null,
      cotacao: null,
      cotacaoData: null,
    });
  });
});
