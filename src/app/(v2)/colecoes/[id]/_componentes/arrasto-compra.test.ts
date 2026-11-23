import { describe, expect, it } from "vitest";

import { BORDA_ESQUERDA, iniciarArrasto, moverArrasto, type EstadoArrasto } from "./arrasto-compra";

/** Uma fileira de cartas de 100 px com vão de 10, começando em x = 50, na altura 0–140. */
function indiceNoPonto(x: number, y: number): number | null {
  if (y < 0 || y > 140) return null;
  const r = x - 50;
  if (r < 0) return null;
  const coluna = Math.floor(r / 110);
  if (r - coluna * 110 > 100) return null; // o vão
  return coluna;
}

function percorrer(estado: EstadoArrasto, pontos: [number, number][]) {
  const pintados: number[] = [];
  for (const [x, y] of pontos) {
    const r = moverArrasto(estado, x, y, indiceNoPonto);
    estado = r.estado;
    pintados.push(...r.novos);
  }
  return { estado, pintados };
}

describe("arrasto de marcação", () => {
  it("abaixo de 8 px é um toque: nada pinta", () => {
    const e = iniciarArrasto(100, 70, 0, true)!;
    const { estado, pintados } = percorrer(e, [[104, 72], [106, 74]]);
    expect(estado.fase).toBe("pronto");
    expect(pintados).toEqual([]);
  });

  it("horizontal depois do limiar pinta a primeira carta e as que o dedo cruza", () => {
    const e = iniciarArrasto(100, 70, 0, true)!;
    const { estado, pintados } = percorrer(e, [[110, 71], [170, 72], [280, 70]]);
    expect(estado).toMatchObject({ fase: "pintando", marcando: true, ultimo: 2 });
    expect(pintados).toEqual([0, 1, 2]);
  });

  it("vertical vira rolagem e nunca mais pinta, nem voltando para o lado", () => {
    const e = iniciarArrasto(100, 70, 0, true)!;
    const { estado, pintados } = percorrer(e, [[103, 80], [300, 82]]);
    expect(estado.fase).toBe("rolagem");
    expect(pintados).toEqual([]);
  });

  it("na diagonal exata a rolagem vence", () => {
    const e = iniciarArrasto(100, 70, 0, true)!;
    expect(moverArrasto(e, 110, 80, indiceNoPonto).estado.fase).toBe("rolagem");
  });

  it("fica na fileira em que começou, mesmo que o dedo escorregue para fora dela", () => {
    const e = iniciarArrasto(100, 70, 0, false)!;
    // y = 400 está fora da fileira; a leitura usa a altura do começo.
    const { pintados } = percorrer(e, [[115, 72], [200, 400]]);
    expect(pintados).toEqual([0, 1]);
  });

  it("um dedo rápido que pula células pinta as do meio, nos dois sentidos", () => {
    const e = iniciarArrasto(380, 70, 3, true)!;
    const ida = percorrer(e, [[392, 70], [60, 70]]);
    expect(ida.pintados).toEqual([3, 2, 1, 0]);
  });

  it("o vão entre cartas não pinta nem perde o lugar", () => {
    const e = iniciarArrasto(100, 70, 0, true)!;
    const { estado, pintados } = percorrer(e, [[115, 70], [155, 70], [170, 70]]);
    expect(pintados).toEqual([0, 1]);
    expect(estado).toMatchObject({ ultimo: 1 });
  });

  it("não começa na faixa do voltar do Safari", () => {
    expect(iniciarArrasto(BORDA_ESQUERDA - 1, 70, 0, true)).toBeNull();
    expect(iniciarArrasto(BORDA_ESQUERDA, 70, 0, true)).not.toBeNull();
  });
});
