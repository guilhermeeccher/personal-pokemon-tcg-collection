import { describe, expect, it } from "vitest";

import { PASSO_ALEM, estiloPolegar, quadrosDoPolegar } from "./polegar";

const lerX = (t: string) => Number(/translateX\((-?[\d.]+)px\)/.exec(t)?.[1]);
const lerL = (w: string) => Number(w.replace("px", ""));

describe("quadrosDoPolegar", () => {
  it("primeira medição não anima: o polegar só aparece no lugar", () => {
    expect(quadrosDoPolegar(null, { x: 10, largura: 40 })).toBeNull();
  });

  it("mesma posição não anima", () => {
    expect(quadrosDoPolegar({ x: 10, largura: 40 }, { x: 10, largura: 40 })).toBeNull();
  });

  it("começa em antes e termina exatamente em depois", () => {
    const q = quadrosDoPolegar({ x: 4, largura: 60 }, { x: 120, largura: 80 })!;
    expect(lerX(q[0].transform)).toBe(4);
    expect(lerL(q[0].width)).toBe(60);
    expect(lerX(q.at(-1)!.transform)).toBe(120);
    expect(lerL(q.at(-1)!.width)).toBe(80);
  });

  it("no meio estica e cobre o centro entre as duas posições", () => {
    const antes = { x: 0, largura: 50 };
    const depois = { x: 200, largura: 50 };
    const meio = quadrosDoPolegar(antes, depois)![1];
    const largura = lerL(meio.width);
    expect(largura).toBeGreaterThan(50);
    expect(lerX(meio.transform) + largura / 2).toBeCloseTo(125, 5);
    expect(meio.transform).toContain("scaleY(.9)");
  });

  it("o passo além vai na direção do movimento", () => {
    const direita = quadrosDoPolegar({ x: 0, largura: 50 }, { x: 100, largura: 50 })!;
    const esquerda = quadrosDoPolegar({ x: 100, largura: 50 }, { x: 0, largura: 50 })!;
    expect(lerX(direita[2].transform)).toBe(100 + PASSO_ALEM);
    expect(lerX(esquerda[2].transform)).toBe(-PASSO_ALEM);
  });

  it("offsets crescentes, dentro de 0..1", () => {
    const q = quadrosDoPolegar({ x: 0, largura: 50 }, { x: 100, largura: 70 })!;
    const offsets = q.map((f) => f.offset).filter((o): o is number => o !== undefined);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    for (const o of offsets) expect(o > 0 && o < 1).toBe(true);
  });
});

describe("estiloPolegar", () => {
  it("arredonda frações longas do DOM", () => {
    expect(estiloPolegar({ x: 10.123456, largura: 33.339 })).toEqual({
      transform: "translateX(10.12px)",
      width: "33.34px",
    });
  });
});
