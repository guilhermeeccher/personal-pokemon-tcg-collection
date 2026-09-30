import { describe, expect, it } from "vitest";

import {
  chaveSemEstoque,
  corteSemEstoque,
  lerRetornoSemEstoque,
  VALIDADE_SEM_ESTOQUE_DIAS,
} from "./sem-estoque-liga";

describe("lerRetornoSemEstoque", () => {
  it("lê o retorno da Liga e ignora a moldura em volta das cartas", () => {
    const { cartas, naoEntendidas } = lerRetornoSemEstoque(
      [
        "Cards sem estoque:",
        "Remover aviso",
        "1 Blastoise (14/100) - [Qualidade = NM]",
        "",
        "1 Blastoise (031/173) - [Qualidade = NM]",
      ].join("\n"),
    );
    expect(naoEntendidas).toEqual([]);
    expect(cartas).toEqual([
      { nome: "Blastoise", numero: "14", total: "100", qualidade: "NM" },
      { nome: "Blastoise", numero: "031", total: "173", qualidade: "NM" },
    ]);
  });

  it("aceita CRLF e espaço sobrando", () => {
    const { cartas } = lerRetornoSemEstoque("  1 Hypno (23/123) - [Qualidade = NM]  \r\n");
    expect(cartas).toHaveLength(1);
  });

  it("aceita linha sem o sufixo de qualidade e carta sem total", () => {
    const { cartas } = lerRetornoSemEstoque("1 Pikachu (SWSH020)\n2 Mew (8/102)");
    expect(cartas).toEqual([
      { nome: "Pikachu", numero: "SWSH020", total: null, qualidade: "" },
      { nome: "Mew", numero: "8", total: "102", qualidade: "" },
    ]);
  });

  it("nome com parêntese não é cortado no primeiro", () => {
    const { cartas } = lerRetornoSemEstoque("1 Pikachu (Delta) (12/100) - [Qualidade = NM]");
    expect(cartas[0]).toMatchObject({ nome: "Pikachu (Delta)", numero: "12", total: "100" });
  });

  it("linha que não é carta volta como não entendida, em vez de sumir", () => {
    const { cartas, naoEntendidas } = lerRetornoSemEstoque("Blastoise sem número\n1 Hypno (23/123)");
    expect(cartas).toHaveLength(1);
    expect(naoEntendidas).toEqual(["Blastoise sem número"]);
  });

  it("a mesma carta colada duas vezes vira uma só", () => {
    const { cartas } = lerRetornoSemEstoque(
      "1 Hypno (23/123) - [Qualidade = NM]\n1 Hypno (023/123) - [Qualidade = NM]",
    );
    expect(cartas).toHaveLength(1);
  });
});

describe("chaveSemEstoque", () => {
  it("zero à esquerda, caixa e espaço não separam a mesma carta", () => {
    expect(chaveSemEstoque({ nome: "Blastoise", numero: "031", total: "173" })).toBe(
      chaveSemEstoque({ nome: " blastoise ", numero: "31", total: "173" }),
    );
  });

  it("número diferente é carta diferente", () => {
    expect(chaveSemEstoque({ nome: "Blastoise", numero: "14", total: "100" })).not.toBe(
      chaveSemEstoque({ nome: "Blastoise", numero: "14", total: "102" }),
    );
  });

  it("carta sem total não colide com carta de total vazio de outro jeito", () => {
    expect(chaveSemEstoque({ nome: "Pikachu", numero: "SWSH020", total: null })).toBe(
      chaveSemEstoque({ nome: "Pikachu", numero: "SWSH020", total: " " }),
    );
  });
});

describe("corteSemEstoque", () => {
  it("é a validade em dias antes de agora", () => {
    const agora = new Date("2026-09-24T12:00:00Z");
    const corte = corteSemEstoque(agora);
    expect(agora.getTime() - corte.getTime()).toBe(VALIDADE_SEM_ESTOQUE_DIAS * 86_400_000);
  });
});
