import { describe, expect, it } from "vitest";

import { mapearEstadosDex } from "@/lib/dominio/dex-estado";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";

import { numeroDex, resumoDaCelula } from "./celula-pokedex";

const TODAS: SecoesContadas = { regional: true, genero: true, especial: true };
const SEM_REGIONAL: SecoesContadas = { regional: false, genero: true, especial: true };

const BASE = { id: "pikachu", categoria: "base" as const, shinyObtenivel: true };
const REGIONAL = { id: "raichu-alola", categoria: "regional" as const, shinyObtenivel: true };
const SEM_SHINY = { id: "pikachu-cap", categoria: "cosmetica" as const, shinyObtenivel: false };

describe("resumoDaCelula", () => {
  it("o estado sai dos registros, por trilha: um shiny não preenche a normal", () => {
    const estados = mapearEstadosDex([
      { formaId: "pikachu", shiny: true, local: "home" },
      { formaId: "raichu-alola", shiny: false, local: "sv" },
    ]);
    expect(resumoDaCelula(BASE, "normal", TODAS, estados).estado).toBe("falta");
    expect(resumoDaCelula(BASE, "shiny", TODAS, estados).estado).toBe("no_home");
    expect(resumoDaCelula(REGIONAL, "normal", TODAS, estados).estado).toBe("no_jogo");
  });

  it("seção desligada: a vaga fica, fora da conta", () => {
    const r = resumoDaCelula(REGIONAL, "normal", SEM_REGIONAL, new Map());
    expect(r).toMatchObject({ foraDaConta: true, conta: false, apagado: true });
  });

  it("forma sem shiny na trilha shiny: fica na grade, apagada e fora do total, mesmo com registro", () => {
    const estados = mapearEstadosDex([{ formaId: "pikachu-cap", shiny: true, local: "home" }]);
    const r = resumoDaCelula(SEM_SHINY, "shiny", TODAS, estados);
    expect(r).toMatchObject({ estado: "no_home", semShiny: true, conta: false, apagado: true });
    expect(resumoDaCelula(SEM_SHINY, "normal", TODAS, estados).semShiny).toBe(false);
  });

  it("no HOME ou no jogo, na trilha certa, não é apagado", () => {
    const estados = mapearEstadosDex([{ formaId: "pikachu", shiny: false, local: "sv" }]);
    expect(resumoDaCelula(BASE, "normal", TODAS, estados)).toMatchObject({ apagado: false, conta: true });
  });
});

describe("numeroDex", () => {
  it("quatro dígitos com cerquilha", () => {
    expect(numeroDex(25)).toBe("#0025");
    expect(numeroDex(1025)).toBe("#1025");
  });
});
