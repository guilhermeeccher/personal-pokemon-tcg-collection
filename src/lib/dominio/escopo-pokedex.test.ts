import { describe, expect, it } from "vitest";

import {
  FAIXA_REGIAO,
  ehRegiao,
  regiaoDoNumero,
  resolverEscopoNacional,
  resolverEscopoRegioes,
} from "./escopo-pokedex";

describe("resolverEscopoNacional", () => {
  it("gera 1025 números, de 1 a 1025", () => {
    const numeros = resolverEscopoNacional();
    expect(numeros).toHaveLength(1025);
    expect(numeros[0]).toBe(1);
    expect(numeros[numeros.length - 1]).toBe(1025);
  });
});

describe("resolverEscopoRegioes", () => {
  it("Kanto sozinho gera 151 números (1..151)", () => {
    const numeros = resolverEscopoRegioes(["kanto"]);
    expect(numeros).toHaveLength(151);
    expect(numeros[0]).toBe(1);
    expect(numeros[numeros.length - 1]).toBe(151);
  });

  it("Kanto + Johto gera 251 números, ordenados, sem lacuna", () => {
    const numeros = resolverEscopoRegioes(["kanto", "johto"]);
    expect(numeros).toHaveLength(251);
    expect(numeros[0]).toBe(1);
    expect(numeros[numeros.length - 1]).toBe(251);
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
  });

  it("Paldea sozinho gera 120 números (906..1025)", () => {
    const numeros = resolverEscopoRegioes(["paldea"]);
    expect(numeros).toHaveLength(120);
    expect(numeros[0]).toBe(906);
    expect(numeros[numeros.length - 1]).toBe(1025);
  });

  it("região repetida não duplica número", () => {
    const numeros = resolverEscopoRegioes(["kanto", "kanto"]);
    expect(numeros).toHaveLength(151);
  });

  it("todas as regiões juntas reproduzem o nacional", () => {
    const todas = resolverEscopoRegioes([
      "kanto",
      "johto",
      "hoenn",
      "sinnoh",
      "unova",
      "kalos",
      "alola",
      "galar",
      "paldea",
    ]);
    expect(todas).toHaveLength(1025);
    expect(todas[0]).toBe(1);
    expect(todas[todas.length - 1]).toBe(1025);
  });

  it("faixas de região não se sobrepõem e cobrem 1..1025 sem lacuna", () => {
    const ordem: (keyof typeof FAIXA_REGIAO)[] = [
      "kanto",
      "johto",
      "hoenn",
      "sinnoh",
      "unova",
      "kalos",
      "alola",
      "galar",
      "paldea",
    ];
    let esperadoInicio = 1;
    for (const regiao of ordem) {
      const faixa = FAIXA_REGIAO[regiao];
      expect(faixa.inicio).toBe(esperadoInicio);
      esperadoInicio = faixa.fim + 1;
    }
    expect(esperadoInicio).toBe(1026);
  });
});

describe("ehRegiao", () => {
  it("aceita as 9 regiões oficiais", () => {
    expect(ehRegiao("kanto")).toBe(true);
    expect(ehRegiao("paldea")).toBe(true);
  });

  it("rejeita string arbitrária e não-string", () => {
    expect(ehRegiao("Kanto")).toBe(false); // case-sensitive
    expect(ehRegiao("orre")).toBe(false);
    expect(ehRegiao(1)).toBe(false);
    expect(ehRegiao(null)).toBe(false);
  });
});

describe("regiaoDoNumero", () => {
  it("resolve os extremos de cada faixa corretamente", () => {
    expect(regiaoDoNumero(1)).toBe("kanto");
    expect(regiaoDoNumero(151)).toBe("kanto");
    expect(regiaoDoNumero(152)).toBe("johto");
    expect(regiaoDoNumero(251)).toBe("johto");
    expect(regiaoDoNumero(252)).toBe("hoenn");
    expect(regiaoDoNumero(1025)).toBe("paldea");
    expect(regiaoDoNumero(906)).toBe("paldea");
  });

  it("lança erro para número fora de 1..1025", () => {
    expect(() => regiaoDoNumero(0)).toThrow();
    expect(() => regiaoDoNumero(1026)).toThrow();
    expect(() => regiaoDoNumero(-5)).toThrow();
  });
});
