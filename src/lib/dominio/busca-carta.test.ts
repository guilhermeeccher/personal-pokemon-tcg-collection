import { describe, expect, it } from "vitest";

import { casaNumeroCarta, parseSiglaNumero } from "./busca-carta";

describe("casaNumeroCarta", () => {
  it("critério pedido: '4', '04' e '004' casam com a carta '004'", () => {
    expect(casaNumeroCarta("004", "4")).toBe(true);
    expect(casaNumeroCarta("004", "04")).toBe(true);
    expect(casaNumeroCarta("004", "004")).toBe(true);
  });

  it("não casa com número diferente", () => {
    expect(casaNumeroCarta("004", "5")).toBe(false);
    expect(casaNumeroCarta("040", "4")).toBe(false); // "40" != "4"
  });

  it("sets antigos sem padding: consulta com padding também casa", () => {
    expect(casaNumeroCarta("4", "004")).toBe(true);
    expect(casaNumeroCarta("4", "04")).toBe(true);
  });

  it("sufixo de letra de secreta: exige o sufixo igual, não é só o número", () => {
    expect(casaNumeroCarta("103a", "103a")).toBe(true);
    expect(casaNumeroCarta("103a", "103")).toBe(false);
    expect(casaNumeroCarta("103", "103a")).toBe(false);
    expect(casaNumeroCarta("103a", "0103a")).toBe(true); // zero à esquerda + sufixo
  });

  it("prefixo de série especial (H01, TG01): casamento exato, case-insensitive", () => {
    expect(casaNumeroCarta("H01", "h01")).toBe(true);
    expect(casaNumeroCarta("H01", "H1")).toBe(false); // "H01" não é zero à esquerda puro
    expect(casaNumeroCarta("TG01", "tg01")).toBe(true);
  });

  it("'000' normaliza para '0', não para vazio", () => {
    expect(casaNumeroCarta("000", "0")).toBe(true);
  });

  it("consulta vazia ou só espaço não filtra (casa com tudo)", () => {
    expect(casaNumeroCarta("004", "")).toBe(true);
    expect(casaNumeroCarta("004", "   ")).toBe(true);
  });
});

describe("parseSiglaNumero", () => {
  it("critérios pedidos: 'MEW 151' e 'mew151'", () => {
    expect(parseSiglaNumero("MEW 151")).toEqual({ sigla: "MEW", numero: "151" });
    expect(parseSiglaNumero("mew151")).toEqual({ sigla: "MEW", numero: "151" });
  });

  it("tolera hífen como separador", () => {
    expect(parseSiglaNumero("MEW-151")).toEqual({ sigla: "MEW", numero: "151" });
  });

  it("tolera zero à esquerda no número (o parse só separa; casaNumeroCarta resolve a tolerância)", () => {
    expect(parseSiglaNumero("mew004")).toEqual({ sigla: "MEW", numero: "004" });
  });

  it("tolera sufixo de letra no número", () => {
    expect(parseSiglaNumero("mew 103a")).toEqual({ sigla: "MEW", numero: "103a" });
  });

  it("espaços nas pontas não atrapalham", () => {
    expect(parseSiglaNumero("  MEW 151  ")).toEqual({ sigla: "MEW", numero: "151" });
  });

  it("retorna null para texto que não é sigla+número — nunca adivinha", () => {
    expect(parseSiglaNumero("Charizard")).toBeNull();
    expect(parseSiglaNumero("151")).toBeNull();
    expect(parseSiglaNumero("MEW")).toBeNull();
    expect(parseSiglaNumero("")).toBeNull();
    expect(parseSiglaNumero("Base Set")).toBeNull(); // tem espaço, mas não termina em número puro
  });
});

describe("parseSiglaNumero — siglas com dígito (sets japoneses)", () => {
  it("aceita a sigla impressa na carta japonesa", () => {
    // O usuário digita o que lê na carta: "sv2a 002/165" (Ivysaur) e
    // "SM3H 009" (Charmander). Antes de 2026-08-26 o parser exigia sigla
    // só de letras e devolvia null para as duas.
    expect(parseSiglaNumero("sv2a 002")).toEqual({ sigla: "SV2A", numero: "002" });
    expect(parseSiglaNumero("SM3H 009")).toEqual({ sigla: "SM3H", numero: "009" });
    expect(parseSiglaNumero("sv2a-002")).toEqual({ sigla: "SV2A", numero: "002" });
  });

  it("aceita sigla ocidental com ponto", () => {
    expect(parseSiglaNumero("sv03.5 4")).toEqual({ sigla: "SV03.5", numero: "4" });
  });

  it("mantém o formato clássico, com e sem separador", () => {
    expect(parseSiglaNumero("MEW 151")).toEqual({ sigla: "MEW", numero: "151" });
    expect(parseSiglaNumero("mew151")).toEqual({ sigla: "MEW", numero: "151" });
    expect(parseSiglaNumero("MEW-151")).toEqual({ sigla: "MEW", numero: "151" });
  });

  it("não adivinha onde a sigla acaba quando não há separador", () => {
    // "sv2a002": a sigla acaba no "a" ou no "2"? Adivinhar aqui viraria
    // cadastro na carta errada, em silêncio.
    expect(parseSiglaNumero("sv2a002")).toBeNull();
  });

  it("segue recusando entrada sem letra ou sem número", () => {
    expect(parseSiglaNumero("151")).toBeNull();
    expect(parseSiglaNumero("abc")).toBeNull();
  });
});
