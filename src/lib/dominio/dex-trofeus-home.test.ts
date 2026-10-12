import { describe, expect, it } from "vitest";

import { mapearEstadosDex } from "./dex-estado";
import { resolverSecoes } from "./dex-secoes";
import { comTrofeusDoHome, progressoDaRegra, proximoTrofeuHome, regraCumprida, type FormaParaTrofeuHome } from "./dex-trofeus-home";
import type { TrofeuDexDTO } from "./tipos-cliente";

const f = (id: string, numero: number, extra: Partial<FormaParaTrofeuHome> = {}): FormaParaTrofeuHome => ({
  id,
  numero,
  categoria: "base",
  shinyObtenivel: true,
  ...extra,
});
const formas = [
  f("bulbasaur", 1),
  f("raichu-alola", 26, { categoria: "regional" }),
  f("unown-b", 201, { categoria: "cosmetica" }),
  f("chikorita", 152, { shinyObtenivel: false }),
];
const reg = (formaId: string, local: string, shiny = false) => ({ formaId, shiny, local });
const todas = resolverSecoes([]);

describe("regras dos troféus do HOME", () => {
  const mapa = mapearEstadosDex([reg("bulbasaur", "home"), reg("raichu-alola", "firered"), reg("unown-b", "home"), reg("chikorita", "home")]);

  it("quantidade conta as vagas no HOME na trilha, das duas vistas", () => {
    expect(regraCumprida({ tipo: "quantidade", quantidade: 3, trilha: "normal" }, formas, mapa, todas)).toBe(true);
    expect(regraCumprida({ tipo: "quantidade", quantidade: 4, trilha: "normal" }, formas, mapa, todas)).toBe(false);
    expect(regraCumprida({ tipo: "quantidade", quantidade: 1, trilha: "shiny" }, formas, mapa, todas)).toBe(false);
  });

  it("região completa pede toda vaga principal que conta no HOME; no jogo não basta", () => {
    expect(regraCumprida({ tipo: "regiao", regiao: "kanto", trilha: "normal" }, formas, mapa, todas)).toBe(false);
    expect(regraCumprida({ tipo: "regiao", regiao: "johto", trilha: "normal" }, formas, mapa, todas)).toBe(true);
    // Desligar as regionais tira o Raichu de Alola da conta, e Kanto fecha.
    expect(regraCumprida({ tipo: "regiao", regiao: "kanto", trilha: "normal" }, formas, mapa, { ...todas, regional: false })).toBe(true);
  });

  it("região sem vaga que conte não vale", () => {
    expect(regraCumprida({ tipo: "regiao", regiao: "paldea", trilha: "normal" }, formas, mapa, todas)).toBe(false);
    // Chikorita sem shiny: Johto não tem vaga na trilha shiny.
    expect(regraCumprida({ tipo: "regiao", regiao: "johto", trilha: "shiny" }, formas, mapa, todas)).toBe(false);
  });

  it("vista completa", () => {
    expect(regraCumprida({ tipo: "vista", vista: "cosmeticas", trilha: "normal" }, formas, mapa, todas)).toBe(true);
    expect(regraCumprida({ tipo: "vista", vista: "principal", trilha: "normal" }, formas, mapa, todas)).toBe(false);
  });

  it("a conquista do HOME é derivada, sem data, e some quando o Pokémon sai", () => {
    const trofeu = (id: string, jogoId: string, regra: TrofeuDexDTO["regra"]): TrofeuDexDTO => ({
      id,
      jogoId,
      tipo: regra ? "calculado" : "marco",
      nivel: "bronze",
      ordem: 1,
      textos: { "pt-BR": { titulo: id, descricao: id }, en: { titulo: id, descricao: id } },
      requer: [],
      libera: [],
      regra,
      obtido: null,
    });
    const lista = [
      trofeu("home-primeiro", "home", { tipo: "quantidade", quantidade: 1, trilha: "normal" }),
      { ...trofeu("firered-x", "firered", null), obtido: { em: "2026-10-12", origem: "manual" as const, notas: null } },
    ];
    const com = comTrofeusDoHome(lista, formas, mapa, todas);
    expect(com[0].obtido).toEqual({ em: null, origem: "calculado", notas: null });
    expect(com[1]).toBe(lista[1]);
    expect(comTrofeusDoHome(lista, formas, mapearEstadosDex([reg("bulbasaur", "firered")]), todas)[0].obtido).toBeNull();
  });

  it("progresso da regra e o próximo troféu a cair", () => {
    expect(progressoDaRegra({ tipo: "quantidade", quantidade: 100, trilha: "normal" }, formas, mapa, todas)).toEqual({ feito: 3, alvo: 100 });
    expect(progressoDaRegra({ tipo: "regiao", regiao: "kanto", trilha: "normal" }, formas, mapa, todas)).toEqual({ feito: 1, alvo: 2 });
    const t = (id: string, regra: Parameters<typeof progressoDaRegra>[0], obtido: unknown = null) => ({ id, regra, obtido });
    const lista = [
      t("home-100", { tipo: "quantidade", quantidade: 100, trilha: "normal" }),
      t("home-kanto", { tipo: "regiao", regiao: "kanto", trilha: "normal" }),
      t("home-johto", { tipo: "regiao", regiao: "johto", trilha: "normal" }, { em: null }),
      t("home-paldea", { tipo: "regiao", regiao: "paldea", trilha: "normal" }),
    ];
    // Kanto 1/2 vence 100 (3/100); Johto já conquistado; Paldea sem vaga não entra.
    expect(proximoTrofeuHome(lista, formas, mapa, todas)).toMatchObject({ trofeu: { id: "home-kanto" }, feito: 1, alvo: 2 });
  });
});
