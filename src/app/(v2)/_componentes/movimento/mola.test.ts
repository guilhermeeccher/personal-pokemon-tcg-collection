import { describe, expect, it } from "vitest";

import {
  type AlvoInclinacao,
  type EstadoInclinacao,
  MOLA_CARTA,
  PASSO_REFERENCIA_MS,
  REPOUSO,
  alvoAutomatico,
  alvoDoPonteiro,
  assentar,
  assentou,
  avancarMola,
  estiloDaInclinacao,
  passoEixo,
  subpassosDoQuadro,
} from "./mola";

/** Roda a mola até assentar (ou até o teto de quadros) e devolve o histórico. */
function simular(
  inicio: EstadoInclinacao,
  alvo: AlvoInclinacao,
  dtMs: number,
  maxQuadros = 2000,
): { quadros: number; estados: EstadoInclinacao[] } {
  let estado = inicio;
  const estados: EstadoInclinacao[] = [];
  for (let q = 1; q <= maxQuadros; q++) {
    estado = avancarMola(estado, alvo, dtMs);
    estados.push(estado);
    if (assentou(estado, alvo)) return { quadros: q, estados };
  }
  return { quadros: Infinity, estados };
}

const CANTO: AlvoInclinacao = { x: 1, y: 0, intensidade: 1 };

describe("passoEixo", () => {
  it("é a fórmula de referência: v = (v + (alvo − x)·k)·amortecimento; x += v", () => {
    const r = passoEixo({ posicao: 0, velocidade: 0 }, 1);
    expect(r.velocidade).toBeCloseTo(1 * MOLA_CARTA.rigidez * MOLA_CARTA.amortecimento, 12);
    expect(r.posicao).toBeCloseTo(r.velocidade, 12);
  });

  it("no alvo e parado, fica parado", () => {
    expect(passoEixo({ posicao: 0.5, velocidade: 0 }, 0.5)).toEqual({ posicao: 0.5, velocidade: 0 });
  });
});

describe("subpassosDoQuadro", () => {
  it("um passo a 60 Hz, dois a 30 Hz, um a 120 Hz", () => {
    expect(subpassosDoQuadro(PASSO_REFERENCIA_MS)).toBe(1);
    expect(subpassosDoQuadro(1000 / 30)).toBe(2);
    expect(subpassosDoQuadro(1000 / 120)).toBe(1);
  });

  it("quadro muito longo tem teto; quadro inválido não anda", () => {
    expect(subpassosDoQuadro(5000)).toBe(4);
    expect(subpassosDoQuadro(0)).toBe(0);
    expect(subpassosDoQuadro(-3)).toBe(0);
    expect(subpassosDoQuadro(Number.NaN)).toBe(0);
  });
});

describe("avancarMola e assentou", () => {
  it("converge para o alvo e assenta em menos de 1,5 s a 60 Hz", () => {
    const { quadros, estados } = simular(assentar(REPOUSO), CANTO, PASSO_REFERENCIA_MS);
    expect(quadros).toBeLessThan(90);
    const fim = estados[estados.length - 1];
    expect(fim.x.posicao).toBeCloseTo(1, 2);
    expect(fim.y.posicao).toBeCloseTo(0, 2);
    expect(fim.intensidade.posicao).toBeCloseTo(1, 2);
  });

  it("passa do alvo um pouco (é mola), mas menos de 20% do caminho", () => {
    const { estados } = simular(assentar(REPOUSO), CANTO, PASSO_REFERENCIA_MS);
    const maxX = Math.max(...estados.map((e) => e.x.posicao));
    expect(maxX).toBeGreaterThan(1);
    expect(maxX - 1).toBeLessThan(0.2 * 0.5);
  });

  it("não oscila para sempre: a amplitude cai a cada volta", () => {
    const { estados } = simular(assentar(REPOUSO), CANTO, PASSO_REFERENCIA_MS);
    const erros = estados.map((e) => Math.abs(e.x.posicao - 1));
    // Os picos locais do erro decrescem estritamente.
    const picos = erros.filter((v, i) => i > 0 && i < erros.length - 1 && v > erros[i - 1] && v >= erros[i + 1]);
    for (let i = 1; i < picos.length; i++) expect(picos[i]).toBeLessThan(picos[i - 1]);
  });

  it("assenta no mesmo tempo a 30 Hz e a 60 Hz (não fica lento no modo de baixo consumo)", () => {
    const a60 = simular(assentar(REPOUSO), CANTO, 1000 / 60).quadros * (1000 / 60);
    const a30 = simular(assentar(REPOUSO), CANTO, 1000 / 30).quadros * (1000 / 30);
    expect(Math.abs(a30 - a60)).toBeLessThanOrEqual(1000 / 30);
  });

  it("assentar põe exatamente no alvo, sem resto: o estado final é o de quem nunca se moveu", () => {
    const { estados } = simular(assentar(CANTO), REPOUSO, PASSO_REFERENCIA_MS);
    const fim = estados[estados.length - 1];
    expect(assentou(fim, REPOUSO)).toBe(true);
    // Ainda há resíduo antes de assentar...
    expect(fim.x.posicao).not.toBe(0.5);
    // ...e assentar o elimina.
    expect(estiloDaInclinacao(assentar(REPOUSO), 10)).toEqual(estiloDaInclinacao(assentar(), 10));
  });

  it("parado longe do alvo não conta como assentado", () => {
    expect(assentou(assentar(REPOUSO), CANTO)).toBe(false);
  });

  it("em movimento perto do alvo não conta como assentado", () => {
    const quase: EstadoInclinacao = {
      x: { posicao: 0.5, velocidade: 0.01 },
      y: { posicao: 0.5, velocidade: 0 },
      intensidade: { posicao: 0, velocidade: 0 },
    };
    expect(assentou(quase, REPOUSO)).toBe(false);
  });
});

describe("alvoDoPonteiro", () => {
  const caixa = { left: 100, top: 50, width: 200, height: 275 };

  it("mapeia a posição sobre a carta para 0–1, com o brilho aceso", () => {
    expect(alvoDoPonteiro(200, 187.5, caixa)).toEqual({ x: 0.5, y: 0.5, intensidade: 1 });
    expect(alvoDoPonteiro(100, 50, caixa)).toEqual({ x: 0, y: 0, intensidade: 1 });
  });

  it("fora da carta fica na borda", () => {
    expect(alvoDoPonteiro(0, 1000, caixa)).toEqual({ x: 0, y: 1, intensidade: 1 });
  });

  it("caixa sem tamanho (carta ainda sem layout) mira o centro", () => {
    expect(alvoDoPonteiro(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toMatchObject({ x: 0.5, y: 0.5 });
  });
});

describe("alvoAutomatico", () => {
  it("passeia dentro da carta, a meia-luz", () => {
    for (let t = 0; t < 30_000; t += 250) {
      const a = alvoAutomatico(t, 1.3);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(1);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(1);
      expect(a.intensidade).toBe(0.7);
    }
  });
});

describe("estiloDaInclinacao", () => {
  it("no repouso, a carta é reta e apagada", () => {
    expect(estiloDaInclinacao(assentar(), 10)).toEqual({
      transform: "perspective(900px) rotateX(0.00deg) rotateY(0.00deg)",
      px: "0.500",
      py: "0.500",
      intensidade: "0.000",
    });
  });

  it("no canto superior direito, inclina o máximo nos dois eixos", () => {
    const e = estiloDaInclinacao(assentar(CANTO), 10);
    expect(e.transform).toBe("perspective(900px) rotateX(10.00deg) rotateY(10.00deg)");
  });

  it("a ultrapassagem da mola não leva o brilho para fora de 0–1", () => {
    const e = estiloDaInclinacao(
      { x: { posicao: 1.08, velocidade: 0 }, y: { posicao: -0.05, velocidade: 0 }, intensidade: { posicao: 1.1, velocidade: 0 } },
      10,
    );
    expect(e.px).toBe("1.000");
    expect(e.py).toBe("0.000");
    expect(e.intensidade).toBe("1.000");
  });
});
