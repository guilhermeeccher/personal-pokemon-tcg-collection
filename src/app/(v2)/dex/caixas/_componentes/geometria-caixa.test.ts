import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { geometriaDaGrade } from "../../../_componentes/grade/geometria-grade";

import {
  ALTURA_CABECALHO_CAIXA,
  ALTURA_EXTRA_CAIXA,
  alturaDaCaixa,
  ladoDaVaga,
  LIMIAR_CAIXAS,
  MIN_CAIXA,
  PROPORCAO_CAIXA,
  RESPIRO_CAIXA,
  VAO_CAIXA,
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

  /*
   * As duas fórmulas acima partem das mesmas três medidas; o que desenha a
   * caixa é o CSS. Este teste lê o arquivo e confere as medidas e que o
   * respiro é o mesmo nos quatro lados (a conta soma 2 × o respiro na
   * vertical): se um lado mudar sem o outro, a última fileira corta ou sobra
   * um vazio embaixo.
   */
  describe("o CSS da caixa (`caixas.module.css`)", () => {
    const css = readFileSync(path.join(__dirname, "caixas.module.css"), "utf8");
    const medida = (nome: string) => Number(new RegExp(`--cx-${nome}:\\s*(\\d+)px`).exec(css)?.[1]);

    it("declara as mesmas três medidas das constantes", () => {
      expect(medida("respiro")).toBe(RESPIRO_CAIXA);
      expect(medida("vao")).toBe(VAO_CAIXA);
      expect(medida("cabecalho")).toBe(ALTURA_CABECALHO_CAIXA);
    });

    it("a caixa tem o respiro nos quatro lados, e as vagas o vão", () => {
      const caixa = /\.caixa\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
      expect(caixa).toMatch(/padding:\s*var\(--cx-respiro\)\s*;/);
      expect(/\.posicoes\s*\{[^}]*\}/.exec(css)?.[0]).toMatch(/gap:\s*var\(--cx-vao\)/);
      expect(/\.cabecalhoCaixa\s*\{[^}]*\}/.exec(css)?.[0]).toMatch(/height:\s*var\(--cx-cabecalho\)/);
    });
  });
});
