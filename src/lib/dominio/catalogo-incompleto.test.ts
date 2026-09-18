import { describe, expect, it } from "vitest";

import { detectarCatalogoIncompleto } from "./catalogo-incompleto";

describe("detectarCatalogoIncompleto", () => {
  it("sinaliza quando materializado é menor que o esperado (caso mfb: 34 de 48)", () => {
    const aviso = detectarCatalogoIncompleto(34, 48);
    expect(aviso).toEqual({
      vagasMaterializadas: 34,
      vagasEsperadas: 48,
      vagasFaltantes: 14,
    });
  });

  it("não sinaliza quando materializado bate com o esperado (caso normal, ex.: sv03.5)", () => {
    expect(detectarCatalogoIncompleto(165, 165)).toBeNull();
  });

  it("não sinaliza quando materializado excede o esperado (defensivo, não deveria ocorrer)", () => {
    expect(detectarCatalogoIncompleto(50, 48)).toBeNull();
  });

  it("sinaliza corretamente para os outros sets levantados (smp, swshp pt, svp)", () => {
    expect(detectarCatalogoIncompleto(240, 248)).toEqual({
      vagasMaterializadas: 240,
      vagasEsperadas: 248,
      vagasFaltantes: 8,
    });
    expect(detectarCatalogoIncompleto(300, 307)).toEqual({
      vagasMaterializadas: 300,
      vagasEsperadas: 307,
      vagasFaltantes: 7,
    });
    expect(detectarCatalogoIncompleto(218, 225)).toEqual({
      vagasMaterializadas: 218,
      vagasEsperadas: 225,
      vagasFaltantes: 7,
    });
  });
});
