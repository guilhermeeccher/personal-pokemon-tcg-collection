import { describe, expect, it } from "vitest";

import {
  faixaDaRaridade,
  FaixaRaridade,
  FILTROS_PADRAO,
  montarOpcoesPorVaga,
  ordenarOpcoes,
  type Filtros,
  type OpcaoCompra,
} from "./liga-opcoes";

function opcao(parcial: Partial<OpcaoCompra> & { preco: number | null }): OpcaoCompra {
  return {
    // Na Pokédex a chave da vaga é o próprio número, então derivá-la do `dex`
    // mantém os casos de teste legíveis.
    chave: String(parcial.dex ?? 1),
    dex: 1,
    especie: "Bulbasaur",
    nome: "Bulbasaur",
    edicaoSigla: "MEG",
    edicaoId: 730,
    edicaoNome: "Mega Evolution",
    numero: "001",
    total: "230",
    precoMedio: parcial.preco,
    precoMaximo: parcial.preco,
    caminho: "/?view=cards/card&card=Bulbasaur (001/230)",
    cartaId: "meg-001",
    idiomaCatalogo: "pt",
    raridade: "Comum",
    setNome: "Mega Evolution",
    ...parcial,
  };
}

describe("faixaDaRaridade", () => {
  it("classifica o vocabulário real do catálogo em português", () => {
    expect(faixaDaRaridade("Comum")).toBe(FaixaRaridade.COMUM);
    expect(faixaDaRaridade("Incomum")).toBe(FaixaRaridade.INCOMUM);
    expect(faixaDaRaridade("Rara")).toBe(FaixaRaridade.RARA);
    expect(faixaDaRaridade("Rara Holo")).toBe(FaixaRaridade.RARA_ESPECIAL);
    expect(faixaDaRaridade("Ultra Rara")).toBe(FaixaRaridade.ULTRA);
    expect(faixaDaRaridade("Ilustração Rara")).toBe(FaixaRaridade.ILUSTRACAO);
    expect(faixaDaRaridade("Rare Secreta")).toBe(FaixaRaridade.ILUSTRACAO);
  });

  it("classifica o vocabulário real em inglês", () => {
    expect(faixaDaRaridade("Common")).toBe(FaixaRaridade.COMUM);
    expect(faixaDaRaridade("Uncommon")).toBe(FaixaRaridade.INCOMUM);
    expect(faixaDaRaridade("Rare")).toBe(FaixaRaridade.RARA);
    expect(faixaDaRaridade("Holo Rare")).toBe(FaixaRaridade.RARA_ESPECIAL);
    expect(faixaDaRaridade("Double rare")).toBe(FaixaRaridade.ULTRA);
    expect(faixaDaRaridade("Special illustration rare")).toBe(FaixaRaridade.ILUSTRACAO);
  });

  it("não confunde Incomum com Comum — é só a ordem dos padrões que separa", () => {
    expect(faixaDaRaridade("Incomum")).not.toBe(faixaDaRaridade("Comum"));
    expect(faixaDaRaridade("Uncommon")).not.toBe(faixaDaRaridade("Common"));
  });

  it("raridade ausente ou desconhecida vira COMUM, nunca some", () => {
    expect(faixaDaRaridade(null)).toBe(FaixaRaridade.COMUM);
    expect(faixaDaRaridade("None")).toBe(FaixaRaridade.COMUM);
    expect(faixaDaRaridade("Categoria que a TCGdex inventar amanhã")).toBe(FaixaRaridade.COMUM);
  });
});

describe("ordenarOpcoes", () => {
  const comum = opcao({ preco: 0.15, raridade: "Comum", cartaId: "a" });
  const rara = opcao({ preco: 8, raridade: "Rara", cartaId: "b" });
  const ultra = opcao({ preco: 19, raridade: "Ultra Rara", cartaId: "c" });
  const foraDoCatalogo = opcao({ preco: 0.4, raridade: null, cartaId: null });

  it("por preferência, a melhor carta vem antes da mais barata", () => {
    const ordenadas = ordenarOpcoes([comum, ultra, rara], "preferencia");
    expect(ordenadas.map((o) => o.raridade)).toEqual(["Ultra Rara", "Rara", "Comum"]);
  });

  it("por preço, o número é o único critério", () => {
    const ordenadas = ordenarOpcoes([ultra, comum, rara], "preco");
    expect(ordenadas.map((o) => o.preco)).toEqual([0.15, 8, 19]);
  });

  it("carta fora do catálogo vai para o fim em preferência", () => {
    const ordenadas = ordenarOpcoes([foraDoCatalogo, comum], "preferencia");
    expect(ordenadas[ordenadas.length - 1].cartaId).toBeNull();
  });

  it("carta fora do catálogo concorre de igual para igual em preço", () => {
    const ordenadas = ordenarOpcoes([comum, foraDoCatalogo], "preco");
    expect(ordenadas[0].preco).toBe(0.15);
    expect(ordenadas[1].cartaId).toBeNull();
  });

  it("desempata por preço dentro da mesma faixa", () => {
    const raraCara = opcao({ preco: 15, raridade: "Rara", cartaId: "d" });
    expect(ordenarOpcoes([raraCara, rara], "preferencia")[0].preco).toBe(8);
  });

  it("não muta a lista recebida", () => {
    const entrada = [ultra, comum];
    ordenarOpcoes(entrada, "preco");
    expect(entrada[0]).toBe(ultra);
  });
});

describe("montarOpcoesPorVaga", () => {
  const vagas = [
    { chave: "1", rotulo: "Bulbasaur", dex: 1 },
    { chave: "4", rotulo: "Charmander", dex: 4 },
  ];

  const barata = opcao({ dex: 1, preco: 0.15, cartaId: "a" });
  const cara = opcao({ dex: 1, preco: 350, raridade: "Ultra Rara", cartaId: "b" });
  const semEstoque = opcao({ dex: 1, preco: null, cartaId: "c" });
  const fora = opcao({ dex: 1, preco: 0.4, raridade: null, cartaId: null });

  const filtros = (p: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_PADRAO, ...p });

  it("corta o que passa do teto", () => {
    const [bulba] = montarOpcoesPorVaga([barata, cara], vagas, filtros({ tetoPreco: 20 }));
    expect(bulba.opcoes).toHaveLength(1);
    expect(bulba.descartadas).toBe(1);
  });

  it("nunca oferece carta sem estoque", () => {
    // R$ 0,00 no site significa "nenhum lojista tem", e uma lista de compras
    // com item impossível de comprar é pior do que uma lista curta.
    const [bulba] = montarOpcoesPorVaga([semEstoque], vagas, filtros());
    expect(bulba.opcoes).toHaveLength(0);
  });

  it("respeita a decisão de exibir carta fora do catálogo", () => {
    const comFora = montarOpcoesPorVaga([fora], vagas, filtros({ incluirForaDoCatalogo: true }));
    expect(comFora[0].opcoes).toHaveLength(1);

    const semFora = montarOpcoesPorVaga([fora], vagas, filtros({ incluirForaDoCatalogo: false }));
    expect(semFora[0].opcoes).toHaveLength(0);
  });

  it("mantém a vaga sem nenhuma opção na lista", () => {
    // Some com ela e o usuário perde a informação mais útil: que aquele
    // Pokémon não tem carta comprável dentro do teto.
    const resultado = montarOpcoesPorVaga([barata], vagas, filtros());
    expect(resultado).toHaveLength(2);
    expect(resultado[1]).toMatchObject({ dex: 4, rotulo: "Charmander", opcoes: [] });
  });

  it("limita por vaga sem perder a contagem do que sobrou", () => {
    const outra = opcao({ dex: 1, preco: 1, cartaId: "d" });
    const [bulba] = montarOpcoesPorVaga([barata, outra], vagas, filtros({ limitePorVaga: 1 }));
    expect(bulba.opcoes).toHaveLength(1);
    expect(bulba.descartadas).toBe(1);
  });

  it("não mistura opção de uma espécie na vaga de outra", () => {
    const charmander = opcao({ dex: 4, especie: "Charmander", preco: 2, nome: "Charmander", cartaId: "e" });
    const resultado = montarOpcoesPorVaga([barata, charmander], vagas, filtros());
    expect(resultado[0].opcoes.map((o) => o.nome)).toEqual(["Bulbasaur"]);
    expect(resultado[1].opcoes.map((o) => o.nome)).toEqual(["Charmander"]);
  });

  it("agrupa vaga de set pela chave de texto, sem depender do dex", () => {
    // A coleção de set não tem número de Pokédex nenhum: a chave é o `local_id`
    // da carta, e cartas de Treinador nem espécie têm. Agrupar por `dex` aqui
    // colapsaria o set inteiro numa vaga só.
    const vagasSet = [
      { chave: "010", rotulo: "Lokix", dex: null },
      { chave: "094", rotulo: "Fragmento Encantado", dex: null },
    ];
    const lokix = opcao({ preco: 1.5, chave: "010", dex: null, especie: null, nome: "Lokix", cartaId: "me02-010" });
    const patch = opcao({ preco: 0.5, chave: "094", dex: null, especie: null, nome: "Wondrous Patch", cartaId: "me02-094" });

    const resultado = montarOpcoesPorVaga([lokix, patch], vagasSet, filtros({ tetoPreco: null }));
    expect(resultado.map((v) => v.chave)).toEqual(["010", "094"]);
    expect(resultado[0].opcoes.map((o) => o.nome)).toEqual(["Lokix"]);
    expect(resultado[1].opcoes.map((o) => o.nome)).toEqual(["Wondrous Patch"]);
  });

  it("mantém a carta do set que passou do teto fora, mas a vaga na lista", () => {
    const vagasSet = [{ chave: "010", rotulo: "Lokix", dex: null }];
    const cara = opcao({ preco: 120, chave: "010", dex: null, especie: null, cartaId: "me02-010" });

    const [vagaSet] = montarOpcoesPorVaga([cara], vagasSet, filtros({ tetoPreco: 20 }));
    expect(vagaSet.opcoes).toHaveLength(0);
    expect(vagaSet.descartadas).toBe(1);
    expect(vagaSet.rotulo).toBe("Lokix");
  });
});
