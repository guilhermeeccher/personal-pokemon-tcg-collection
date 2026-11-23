import { describe, expect, it } from "vitest";

import { geometriaDaGrade } from "../../../_componentes/grade/geometria-grade";

import {
  ALTURA_EXTRA_CAIXA,
  alturaDaCaixa,
  ladoDaVaga,
  LIMIAR_CAIXAS,
  MIN_CAIXA,
  PROPORCAO_CAIXA,
} from "./geometria-caixa";

describe("geometria da caixa na grade virtual", () => {
  it("a altura afim (proporção e extra) é a altura do desenho, em qualquer largura", () => {
    for (const largura of [288, 300, 345, 361, 420, 560, 1180]) {
      const g = geometriaDaGrade({
        largura,
        minCelula: MIN_CAIXA,
        vaoX: 0,
        vaoY: 0,
        proporcao: PROPORCAO_CAIXA,
        alturaExtra: ALTURA_EXTRA_CAIXA,
      });
      expect(g.alturaCelula).toBeCloseTo(alturaDaCaixa(g.larguraCelula), 6);
    }
  });

  it("os valores conferidos à mão: respiro 8, vão 4, cabeçalho 44", () => {
    expect(PROPORCAO_CAIXA).toBeCloseTo(5 / 6, 12);
    expect(ALTURA_EXTRA_CAIXA).toBeCloseTo(46, 9);
  });

  it("a vaga mede 44 px na menor caixa e passa de 42 px na tela de 320 px", () => {
    expect(ladoDaVaga(MIN_CAIXA)).toBe(44);
    // 320 px de tela, 16 px de respiro de cada lado: a caixa tem 288 px.
    expect(ladoDaVaga(288)).toBe(42);
  });

  it("o limiar são 300 vagas, o mesmo da regra 13", () => {
    expect(LIMIAR_CAIXAS * 30).toBe(300);
  });
});
