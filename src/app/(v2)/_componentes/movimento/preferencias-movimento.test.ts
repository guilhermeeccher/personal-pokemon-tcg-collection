import { describe, expect, it } from "vitest";

import {
  DECISAO_PADRAO,
  ESCOLHAS_MODO,
  MIN_AMOSTRAS_QUADRO,
  decidirMovimento,
  lerEscolhaModo,
  medianaIntervalos,
  modoPelosQuadros,
} from "./preferencias-movimento";

const quadros = (ms: number, n = 60) => Array.from({ length: n }, () => ms);

describe("lerEscolhaModo", () => {
  it("aceita os três valores", () => {
    for (const e of ESCOLHAS_MODO) expect(lerEscolhaModo(e)).toBe(e);
  });

  it("vazio, ausente ou desconhecido é auto (o armazenamento pode vir vazio ou corrompido)", () => {
    expect(lerEscolhaModo(null)).toBe("auto");
    expect(lerEscolhaModo(undefined)).toBe("auto");
    expect(lerEscolhaModo("")).toBe("auto");
    expect(lerEscolhaModo("LEVE")).toBe("auto");
    expect(lerEscolhaModo("rapido")).toBe("auto");
  });
});

describe("medianaIntervalos", () => {
  it("mediana de quantidade ímpar e par", () => {
    expect(medianaIntervalos([16, 33, 17])).toBe(17);
    expect(medianaIntervalos([16, 18, 30, 34])).toBe(24);
  });

  it("descarta pausas e lixo", () => {
    expect(medianaIntervalos([16, 16, 16, 900, Number.NaN, -1, 0])).toBe(16);
    expect(medianaIntervalos([900, Number.POSITIVE_INFINITY])).toBeNull();
  });
});

describe("modoPelosQuadros", () => {
  it("60 Hz e 120 Hz são completo", () => {
    expect(modoPelosQuadros(quadros(1000 / 60))).toBe("completo");
    expect(modoPelosQuadros(quadros(1000 / 120))).toBe("completo");
  });

  it("30 Hz (iOS em economia de energia) é leve", () => {
    expect(modoPelosQuadros(quadros(1000 / 30))).toBe("leve");
  });

  it("uns quadros perdidos não viram modo leve (mediana, não média)", () => {
    const amostra = [...quadros(16.7, 50), ...quadros(120, 20)];
    expect(modoPelosQuadros(amostra)).toBe("completo");
  });

  it("amostra curta é sem sinal", () => {
    expect(modoPelosQuadros(quadros(33, MIN_AMOSTRAS_QUADRO - 1))).toBeNull();
    expect(modoPelosQuadros([])).toBeNull();
  });

  it("aba no fundo (só pausas) é sem sinal, não leve", () => {
    expect(modoPelosQuadros(quadros(1000, 60))).toBeNull();
  });
});

describe("decidirMovimento", () => {
  it("sem sinal nenhum: completo, com tudo ligado", () => {
    expect(decidirMovimento({ reduzido: false, escolha: "auto", heuristica: null })).toEqual({
      modo: "completo",
      origemModo: "padrao",
      reduzido: false,
      mola: true,
      animacaoContinua: true,
      transicoes: true,
    });
    expect(DECISAO_PADRAO.modo).toBe("completo");
  });

  it("a heurística decide quando o interruptor está em auto", () => {
    const d = decidirMovimento({ reduzido: false, escolha: "auto", heuristica: "leve" });
    expect(d).toMatchObject({ modo: "leve", origemModo: "heuristica" });
  });

  it("o interruptor manual vence a heurística, nos dois sentidos", () => {
    expect(decidirMovimento({ reduzido: false, escolha: "completo", heuristica: "leve" })).toMatchObject({
      modo: "completo",
      origemModo: "manual",
      mola: true,
    });
    expect(decidirMovimento({ reduzido: false, escolha: "leve", heuristica: "completo" })).toMatchObject({
      modo: "leve",
      origemModo: "manual",
      mola: false,
    });
    expect(decidirMovimento({ reduzido: false, escolha: "leve", heuristica: null })).toMatchObject({
      modo: "leve",
      origemModo: "manual",
    });
  });

  it("modo leve: efeitos estáticos, mas as View Transitions ficam", () => {
    expect(decidirMovimento({ reduzido: false, escolha: "leve", heuristica: null })).toMatchObject({
      mola: false,
      animacaoContinua: false,
      transicoes: true,
    });
  });

  it("movimento reduzido desliga mola, animação contínua e transições em qualquer modo", () => {
    for (const escolha of ESCOLHAS_MODO) {
      for (const heuristica of ["completo", "leve", null] as const) {
        const d = decidirMovimento({ reduzido: true, escolha, heuristica });
        expect(d.reduzido).toBe(true);
        expect(d.mola).toBe(false);
        expect(d.animacaoContinua).toBe(false);
        expect(d.transicoes).toBe(false);
      }
    }
  });

  it("movimento reduzido não muda o modo escolhido (o interruptor continua mostrando a escolha)", () => {
    expect(decidirMovimento({ reduzido: true, escolha: "completo", heuristica: "leve" }).modo).toBe("completo");
  });
});
