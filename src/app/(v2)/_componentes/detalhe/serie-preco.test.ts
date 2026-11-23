import { describe, expect, it } from "vitest";

import { desenharSerie, resumirSerie } from "./serie-preco";

describe("desenharSerie", () => {
  it("menos de dois pontos não é linha", () => {
    expect(desenharSerie([], 100, 40)).toBeNull();
    expect(desenharSerie([{ em: "2026-11-01T00:00:00Z", valor: 10 }], 100, 40)).toBeNull();
  });

  it("x pelo tempo: um intervalo maior ocupa mais largura", () => {
    const d = desenharSerie(
      [
        { em: "2026-11-01T00:00:00Z", valor: 10 },
        { em: "2026-11-02T00:00:00Z", valor: 20 },
        { em: "2026-11-11T00:00:00Z", valor: 15 },
      ],
      100,
      40,
    );
    // O segundo ponto fica a 1/10 da largura, não no meio.
    expect(d?.linha).toBe("M0 36 L10 4 L100 20");
    expect(d?.area).toBe("M0 36 L10 4 L100 20 L100 40 L0 40 Z");
    expect(d?.ultimo).toEqual({ x: 100, y: 20 });
  });

  it("série reta fica no meio", () => {
    const d = desenharSerie(
      [
        { em: "2026-11-01T00:00:00Z", valor: 7 },
        { em: "2026-11-05T00:00:00Z", valor: 7 },
      ],
      50,
      40,
    );
    expect(d?.linha).toBe("M0 20 L50 20");
  });
});

describe("resumirSerie", () => {
  it("de quando a quando, mínimo e máximo", () => {
    const r = resumirSerie([
      { em: "a", valor: 5 },
      { em: "b", valor: 2 },
      { em: "c", valor: 9 },
    ]);
    expect(r).toEqual({ pontos: 3, primeiro: { em: "a", valor: 5 }, ultimo: { em: "c", valor: 9 }, menor: 2, maior: 9 });
    expect(resumirSerie([])).toBeNull();
  });
});
