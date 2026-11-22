import { describe, expect, it } from "vitest";

import { LADO_MAXIMO_MAPA, decidirRefracao, escalaDoDeslocamento, mapaDaLente } from "./refracao";

const CHROME = [{ brand: "Chromium" }, { brand: "Google Chrome" }, { brand: "Not=A?Brand" }];

describe("decidirRefracao", () => {
  it("liga só no Chromium, em contexto seguro, no modo completo", () => {
    expect(decidirRefracao({ contextoSeguro: true, marcas: CHROME, modoLeve: false })).toBe(true);
  });

  it("por HTTP na rede local fica desligada, mesmo no Chrome", () => {
    expect(decidirRefracao({ contextoSeguro: false, marcas: CHROME, modoLeve: false })).toBe(false);
  });

  it("sem userAgentData (Safari, Firefox, HTTP) fica desligada", () => {
    expect(decidirRefracao({ contextoSeguro: true, marcas: undefined, modoLeve: false })).toBe(false);
  });

  it("sem a marca Chromium fica desligada", () => {
    expect(decidirRefracao({ contextoSeguro: true, marcas: [{ brand: "Outro" }], modoLeve: false })).toBe(false);
  });

  it("o modo leve desliga", () => {
    expect(decidirRefracao({ contextoSeguro: true, marcas: CHROME, modoLeve: true })).toBe(false);
  });
});

describe("mapaDaLente", () => {
  const ler = (m: ReturnType<typeof mapaDaLente>, x: number, y: number) => {
    const i = (y * m.largura + x) * 4;
    return [m.pixels[i], m.pixels[i + 1], m.pixels[i + 2], m.pixels[i + 3]];
  };

  it("reduz ao lado máximo, mantendo a proporção", () => {
    const m = mapaDaLente({ largura: 1040, altura: 520, raio: 28, borda: 28 });
    expect(m.largura).toBe(LADO_MAXIMO_MAPA);
    expect(m.altura).toBe(LADO_MAXIMO_MAPA / 2);
    expect(m.pixels.length).toBe(m.largura * m.altura * 4);
  });

  it("o miolo é neutro", () => {
    const m = mapaDaLente({ largura: 200, altura: 100, raio: 20, borda: 20 });
    expect(ler(m, 100, 50)).toEqual([128, 128, 128, 255]);
  });

  it("a borda desvia para dentro, simétrica", () => {
    const m = mapaDaLente({ largura: 200, altura: 100, raio: 20, borda: 20 });
    const [rEsq] = ler(m, 0, 50);
    const [rDir] = ler(m, 199, 50);
    // Na borda esquerda a normal aponta para fora (x negativo): R sobe.
    expect(rEsq).toBeGreaterThan(128);
    expect(rDir).toBeLessThan(128);
    expect(rEsq - 128).toBeCloseTo(128 - rDir, 0);
    const [, gTopo] = ler(m, 100, 0);
    expect(gTopo).toBeGreaterThan(128);
  });
});

describe("escalaDoDeslocamento", () => {
  it("fica entre 26 e 70", () => {
    expect(escalaDoDeslocamento(20, 20)).toBe(26);
    expect(escalaDoDeslocamento(1000, 1000)).toBe(70);
    expect(escalaDoDeslocamento(100, 62)).toBeCloseTo(34.1);
  });
});
