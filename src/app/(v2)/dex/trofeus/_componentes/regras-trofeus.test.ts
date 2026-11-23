import { describe, expect, it } from "vitest";

import { JOGO_HOME } from "@/lib/dominio/dex-trofeus";

import { abasDeTrofeus, acoesDoTrofeu, dataDeConquistaValida, jogoQueAbre, trofeusVisiveis } from "./regras-trofeus";

const obtido = { em: "2026-11-20", origem: "manual" as const, notas: null };

describe("abasDeTrofeus", () => {
  it("o HOME primeiro, depois os jogos da pessoa que têm troféus, na ordem dela", () => {
    const jogos = [
      { jogoId: "scarlet", nome: "Scarlet" },
      { jogoId: "go", nome: "GO" },
      { jogoId: "firered", nome: "FireRed" },
    ];
    const trofeus = [{ jogoId: "firered" }, { jogoId: JOGO_HOME }, { jogoId: "scarlet" }, { jogoId: "emerald" }];
    expect(abasDeTrofeus(jogos, trofeus)).toEqual([
      { jogoId: JOGO_HOME, nome: "Pokémon HOME" },
      { jogoId: "scarlet", nome: "Scarlet" },
      { jogoId: "firered", nome: "FireRed" },
    ]);
  });

  it("sem troféu do HOME no arquivo, não há aba do HOME", () => {
    expect(abasDeTrofeus([{ jogoId: "go", nome: "GO" }], [{ jogoId: "go" }])).toEqual([{ jogoId: "go", nome: "GO" }]);
  });
});

describe("jogoQueAbre", () => {
  const abas = [
    { jogoId: JOGO_HOME, nome: "Pokémon HOME" },
    { jogoId: "firered", nome: "FireRed" },
  ];
  it("o `?jogo=` quando é uma aba", () => expect(jogoQueAbre(abas, "firered")).toBe("firered"));
  it("um jogo que não é aba abre a primeira", () => expect(jogoQueAbre(abas, "emerald")).toBe(JOGO_HOME));
  it("sem abas, vazio", () => expect(jogoQueAbre([], "firered")).toBe(""));
});

describe("trofeusVisiveis", () => {
  const lista = [
    { id: "a", jogoId: "firered", obtido },
    { id: "b", jogoId: "firered", obtido: null },
    { id: "c", jogoId: "scarlet", obtido: null },
    { id: "d", jogoId: "firered", obtido: null },
  ];
  it("só os do jogo, na ordem recebida (a da história)", () => {
    expect(trofeusVisiveis(lista, "firered", false).map((t) => t.id)).toEqual(["a", "b", "d"]);
  });
  it("só o que falta esconde o conquistado", () => {
    expect(trofeusVisiveis(lista, "firered", true).map((t) => t.id)).toEqual(["b", "d"]);
  });
});

describe("acoesDoTrofeu", () => {
  it("o do HOME nunca se marca nem se desmarca: só caçar, enquanto falta", () => {
    expect(acoesDoTrofeu({ tipo: "calculado", obtido: null })).toEqual(["cacar"]);
    expect(acoesDoTrofeu({ tipo: "calculado", obtido: { em: null, origem: "calculado", notas: null } })).toEqual([]);
  });
  it("checkpoint e marco: marcar e caçar enquanto falta; desfazer depois", () => {
    for (const tipo of ["checkpoint", "marco"] as const) {
      expect(acoesDoTrofeu({ tipo, obtido: null })).toEqual(["conquistei", "cacar"]);
      expect(acoesDoTrofeu({ tipo, obtido })).toEqual(["desfazer"]);
    }
  });
});

describe("dataDeConquistaValida", () => {
  it("aceita a data do campo", () => expect(dataDeConquistaValida("2026-02-28")).toBe(true));
  it("recusa vazio, formato errado e dia que não existe", () => {
    expect(dataDeConquistaValida("")).toBe(false);
    expect(dataDeConquistaValida("28/02/2026")).toBe(false);
    expect(dataDeConquistaValida("2026-02-30")).toBe(false);
  });
});
