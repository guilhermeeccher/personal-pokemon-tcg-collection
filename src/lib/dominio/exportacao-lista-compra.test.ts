import { describe, expect, it } from "vitest";

import { gerarCsv } from "./exportacao-csv";
import {
  adapterListaCompra,
  gerarListaLiga,
  gerarListaTexto,
  linhaFormatoLiga,
  totalDaLista,
  type LinhaListaCompra,
} from "./exportacao-lista-compra";

function linha(p: Partial<LinhaListaCompra> = {}): LinhaListaCompra {
  return {
    chave: "1",
    especie: "Bulbasaur",
    nome: "Bulbasaur",
    edicaoNome: "Pokémon Card 151",
    edicaoSigla: "MEW",
    numero: "001",
    total: "165",
    preco: 1.5,
    raridade: "Comum",
    noCatalogo: true,
    caminho: "/?view=cards/card&card=Bulbasaur (001/165)",
    ...p,
  };
}

describe("adapterListaCompra", () => {
  it("escreve decimal com vírgula, para abrir em planilha pt-BR", () => {
    const csv = gerarCsv(adapterListaCompra, [linha({ preco: 1234.5 })]);
    expect(csv).toContain("1234,50");
    expect(csv).not.toContain("1234.50");
  });

  it("marca a carta fora do catálogo, que é a que exige cadastro manual depois", () => {
    const csv = gerarCsv(adapterListaCompra, [
      linha({ noCatalogo: true }),
      linha({ noCatalogo: false, raridade: null }),
    ]);
    const linhas = csv.trim().split("\r\n");
    expect(linhas[1]).toContain(";sim;");
    expect(linhas[2]).toContain(";não;");
  });

  it("monta link absoluto para a carta no site deles", () => {
    const csv = gerarCsv(adapterListaCompra, [linha()]);
    expect(csv).toContain("https://www.ligapokemon.com.br/?view=cards/card");
  });

  it("sobrevive a nome de carta com o separador do CSV", () => {
    const csv = gerarCsv(adapterListaCompra, [linha({ nome: "Bulbasaur; o falso" })]);
    expect(csv).toContain('"Bulbasaur; o falso"');
  });

  it("cabeçalho e linha têm o mesmo número de campos", () => {
    expect(adapterListaCompra.linha(linha())).toHaveLength(adapterListaCompra.cabecalho.length);
  });
});

describe("gerarListaTexto", () => {
  it("uma carta por linha, quantidade sempre 1", () => {
    expect(gerarListaTexto([linha()])).toBe("1 Bulbasaur (001/165) [MEW]\n");
  });

  it("carta sem total impresso não inventa denominador", () => {
    expect(gerarListaTexto([linha({ total: null })])).toBe("1 Bulbasaur (001) [MEW]\n");
  });

  it("repete a linha em vez de agrupar quantidade", () => {
    // Duas vagas distintas são duas decisões dele; agrupar em "2 ..."
    // esconderia isso.
    const texto = gerarListaTexto([linha({ chave: "1" }), linha({ chave: "2", especie: "Ivysaur" })]);
    expect(texto.trim().split("\n")).toHaveLength(2);
  });
});

describe("totalDaLista", () => {
  it("soma sem erro de ponto flutuante", () => {
    expect(totalDaLista([linha({ preco: 0.1 }), linha({ preco: 0.2 })])).toBe(0.3);
  });

  it("lista vazia soma zero", () => {
    expect(totalDaLista([])).toBe(0);
  });
});

describe("linhaFormatoLiga", () => {
  it("escreve no modelo que a tela deles instrui: [Quantidade] [Card]", () => {
    expect(linhaFormatoLiga(linha())).toBe("1 Bulbasaur (001/165)");
  });

  it("omite a barra quando a carta não tem total impresso", () => {
    expect(linhaFormatoLiga(linha({ total: null, numero: "SV001" }))).toBe(
      "1 Bulbasaur (SV001)",
    );
  });

  it("não leva a sigla da edição — o formato deles não a prevê", () => {
    expect(linhaFormatoLiga(linha())).not.toContain("MEW");
  });
});

describe("gerarListaLiga", () => {
  it("devolve uma lista só, na ordem da tela", () => {
    // A divisão por extra foi desfeita em 2026-09-16: duas listas viravam
    // duas otimizações de loja independentes na Liga, contra o frete.
    expect(
      gerarListaLiga([linha({ nome: "Z" }), linha({ nome: "A" })]),
    ).toBe("1 Z (001/165)\n1 A (001/165)\n");
  });

  it("é vazia quando não há seleção, sem quebra de linha solta", () => {
    expect(gerarListaLiga([])).toBe("");
  });
});
