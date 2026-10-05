import { describe, expect, it } from "vitest";

import { fotografarPrecos, variacaoEntrePontos } from "./historico-precos";

const achada = (preco: number | null, precoMedio: number | null) => ({
  encontrada: true,
  preco,
  precoMedio,
  precoMaximo: null,
});

describe("fotografarPrecos", () => {
  it("tabela vazia dá zeros, sem dividir por zero", () => {
    expect(fotografarPrecos([])).toEqual({
      somaMedios: 0,
      cartasComPreco: 0,
      precoMedioPorCarta: 0,
      somaMinimos: 0,
    });
  });

  it("soma médios, conta cartas e tira a média por carta", () => {
    const f = fotografarPrecos([achada(1, 10), achada(2, 20), achada(3, 30)]);
    expect(f).toEqual({ somaMedios: 60, cartasComPreco: 3, precoMedioPorCarta: 20, somaMinimos: 6 });
  });

  it("sem média usa o mínimo, a mesma regra da tela", () => {
    const f = fotografarPrecos([achada(5, null), achada(1, 10)]);
    expect(f.somaMedios).toBe(15);
    expect(f.cartasComPreco).toBe(2);
    expect(f.somaMinimos).toBe(6);
  });

  it("carta não achada, ou sem nenhum preço, não entra", () => {
    const f = fotografarPrecos([
      { encontrada: false, preco: 9, precoMedio: 9, precoMaximo: 9 },
      achada(null, null),
      achada(2, 4),
    ]);
    expect(f).toEqual({ somaMedios: 4, cartasComPreco: 1, precoMedioPorCarta: 4, somaMinimos: 2 });
  });

  it("arredonda em centavos", () => {
    const f = fotografarPrecos([achada(0.1, 0.1), achada(0.2, 0.2), achada(0.1, 0.1)]);
    expect(f.somaMedios).toBe(0.4);
    expect(f.precoMedioPorCarta).toBe(0.13);
  });
});

describe("variacaoEntrePontos", () => {
  it("separa total, cartas novas e preço médio por carta", () => {
    expect(
      variacaoEntrePontos(
        { somaMedios: 100, cartasComPreco: 10, precoMedioPorCarta: 10 },
        { somaMedios: 150, cartasComPreco: 20, precoMedioPorCarta: 7.5 },
      ),
    ).toEqual({ total: 50, cartas: 10, precoMedioPorCarta: -2.5 });
  });
});
