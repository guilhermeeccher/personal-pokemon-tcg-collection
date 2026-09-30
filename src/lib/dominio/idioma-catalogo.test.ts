import { describe, expect, it } from "vitest";

import {
  contagensDoSet,
  escolherLinhaPorCarta,
  ordemIdiomasPorCarta,
  resolverIdiomaCatalogoDoSet,
} from "./idioma-catalogo";

describe("ordemIdiomasPorCarta", () => {
  it("pt procura pt e depois en; en procura en e depois pt", () => {
    expect(ordemIdiomasPorCarta("pt")).toEqual(["pt", "en"]);
    expect(ordemIdiomasPorCarta("en")).toEqual(["en", "pt"]);
  });

  it("jp fica isolado — a numeração japonesa não é a ocidental", () => {
    expect(ordemIdiomasPorCarta("jp")).toEqual(["jp"]);
  });
});

describe("escolherLinhaPorCarta", () => {
  // Caso real (2026-09-30): o 30th chegou do upstream com 2 cartas em pt e
  // o set inteiro em en.
  const linhas = [
    { localId: "001", idioma: "pt" as const, nome: "Exeggcute" },
    { localId: "001", idioma: "en" as const, nome: "Exeggcute" },
    { localId: "002", idioma: "en" as const, nome: "Alolan Exeggutor" },
    { localId: "002", idioma: "pt" as const, nome: "Exeggutor de Alola" },
    { localId: "003", idioma: "en" as const, nome: "Pinsir" },
  ];

  it("preferido pt: usa pt onde existe e completa com en", () => {
    const escolhidas = escolherLinhaPorCarta(linhas, "pt");
    expect(escolhidas.map((l) => [l.localId, l.idioma])).toEqual([
      ["001", "pt"],
      ["002", "pt"],
      ["003", "en"],
    ]);
  });

  it("preferido en: usa en onde existe, sem depender da ordem da entrada", () => {
    const escolhidas = escolherLinhaPorCarta(linhas, "en");
    expect(escolhidas.map((l) => l.nome)).toEqual([
      "Exeggcute",
      "Alolan Exeggutor",
      "Pinsir",
    ]);
    expect(escolhidas.every((l) => l.idioma === "en")).toBe(true);
  });

  it("preferido en completa com pt a carta que só existe em pt", () => {
    const soPt = [{ localId: "B", idioma: "pt" as const }];
    expect(escolherLinhaPorCarta(soPt, "en")).toEqual(soPt);
  });

  it("nunca mistura jp com pt/en, em nenhuma direção", () => {
    // neo1: en numera "1".."111", jp numera "001".."096".
    const neo = [
      { localId: "1", idioma: "en" as const },
      { localId: "001", idioma: "jp" as const },
    ];
    expect(escolherLinhaPorCarta(neo, "pt")).toEqual([neo[0]]);
    expect(escolherLinhaPorCarta(neo, "jp")).toEqual([neo[1]]);
  });

  it("sem nenhuma linha nos idiomas da ordem, devolve vazio", () => {
    expect(escolherLinhaPorCarta([{ localId: "001", idioma: "jp" as const }], "en")).toEqual([]);
  });
});

describe("contagensDoSet", () => {
  it("usa o maior oficial e o maior total entre os idiomas", () => {
    // sm1: pt conhece 163 cartas, en 172; a numeração oficial é a mesma.
    expect(
      contagensDoSet([
        { qtdOficial: 149, qtdTotal: 163 },
        { qtdOficial: 149, qtdTotal: 172 },
      ]),
    ).toEqual({ qtdOficial: 149, qtdTotal: 172 });
  });

  it("set sem numeração oficial continua com oficial 0", () => {
    expect(contagensDoSet([{ qtdOficial: 0, qtdTotal: 88 }])).toEqual({
      qtdOficial: 0,
      qtdTotal: 88,
    });
  });
});

describe("resolverIdiomaCatalogoDoSet", () => {
  it("usa pt quando o set tem carta a carta em pt", () => {
    expect(resolverIdiomaCatalogoDoSet(["pt", "en"])).toBe("pt");
  });

  it("cai para en quando o set não tem nenhuma carta em pt (regra 7 do AGENTS.md)", () => {
    // Caso real: base1 (Coleção Básica) tem 0 linhas em pt no catálogo.
    expect(resolverIdiomaCatalogoDoSet(["en"])).toBe("en");
  });

  it("usa jp em set exclusivo do Japão", () => {
    // Caso real: SM3H (闘う虹を見たか) só existe em japonês — é o set do
    // Charmander usado como caso real. Antes de 2026-08-26 esta função
    // devolvia "en" aqui, e a grade de cadastro respondia "Set não
    // encontrado" para os 116 sets nessa condição.
    expect(resolverIdiomaCatalogoDoSet(["jp"])).toBe("jp");
  });

  it("prefere pt e en ao japonês quando o set existe nos três", () => {
    expect(resolverIdiomaCatalogoDoSet(["jp", "en", "pt"])).toBe("pt");
    expect(resolverIdiomaCatalogoDoSet(["jp", "en"])).toBe("en");
  });

  it("devolve en quando o set não existe em idioma nenhum", () => {
    expect(resolverIdiomaCatalogoDoSet([])).toBe("en");
  });
});
