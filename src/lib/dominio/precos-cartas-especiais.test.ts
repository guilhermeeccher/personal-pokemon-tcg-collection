import { describe, expect, it } from "vitest";

import type { LinhaBuscaLiga } from "./liga-busca";
import {
  compararPorValorDesc,
  ehCartaEspecial,
  escolherLinhaDePreco,
  ordenarJoias,
  resumirPrecos,
  selecionarCartasParaPreco,
  separarCartasPorFrescor,
  type LinhaCatalogoParaPreco,
} from "./precos-cartas-especiais";

function linhaCat(p: Partial<LinhaCatalogoParaPreco>): LinhaCatalogoParaPreco {
  return {
    cartaId: "x-001",
    idioma: "pt",
    nome: "Carta",
    setId: "x",
    setNome: "Set X",
    setSigla: "XX",
    localId: "001",
    raridade: "Comum",
    ...p,
  };
}

function linhaLiga(p: Partial<LinhaBuscaLiga>): LinhaBuscaLiga {
  return {
    nome: "Carta",
    edicaoSigla: "XX",
    edicaoId: 1,
    edicaoNome: "Set X",
    numero: "001",
    total: "100",
    preco: 10,
    precoMedio: 12,
    precoMaximo: 15,
    caminho: "/x",
    ...p,
  };
}

describe("ehCartaEspecial", () => {
  it("recusa só comum e incomum, em qualquer idioma, caixa ou acento", () => {
    for (const r of ["Comum", "Common", "Incomum", "Uncommon", "INCOMUM", " common "]) {
      expect(ehCartaEspecial({ setId: "a", raridade: r })).toBe(false);
    }
  });

  it("aceita raras simples, Pikachu Rare, Promo, vazio, None e holo/secreta", () => {
    for (const r of [
      "Rara",
      "Rare",
      "Pikachu Rare",
      "Promo",
      "None",
      "",
      null,
      "Rara Holo",
      "Ilustração Rara Especial",
      "Futuristic Rare",
    ]) {
      expect(ehCartaEspecial({ setId: "a", raridade: r })).toBe(true);
    }
  });

  it("toda carta das clássicas de 30 anos entra, mesmo com raridade 'None'", () => {
    expect(ehCartaEspecial({ setId: "30th-c", raridade: "None" })).toBe(true);
    expect(ehCartaEspecial({ setId: "30th-c", raridade: null })).toBe(true);
    expect(ehCartaEspecial({ setId: "30th", raridade: "Comum" })).toBe(false);
  });
});

describe("selecionarCartasParaPreco", () => {
  it("junta pt e en do mesmo carta_id numa consulta só, buscando pelo nome em inglês", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", idioma: "pt", nome: "Fragmento", raridade: "Rara Holo" }),
      linhaCat({ cartaId: "a-1", idioma: "en", nome: "Patch", raridade: "Holo Rare" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: "Fragmento", nomeBusca: "Patch", nomeAlternativo: "Fragmento" });
  });

  it("sem linha en usa o nome que tem e não repete a tentativa", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", nome: "Pikachu", raridade: "Rara Holo" }),
    ]);
    expect(r[0]).toMatchObject({ nomeBusca: "Pikachu", nomeAlternativo: null });
  });

  it("nome igual nos dois idiomas não gera segunda tentativa", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", idioma: "pt", nome: "Charizard", raridade: "Rara Holo" }),
      linhaCat({ cartaId: "a-1", idioma: "en", nome: "Charizard", raridade: "Holo Rare" }),
    ]);
    expect(r[0].nomeAlternativo).toBeNull();
  });

  it("uma ficha sem raridade não tira a carta; uma comum/incomum tira", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", idioma: "pt", raridade: null }),
      linhaCat({ cartaId: "a-1", idioma: "en", raridade: "Holo Rare" }),
      linhaCat({ cartaId: "b-1", idioma: "pt", raridade: null }),
      linhaCat({ cartaId: "b-1", idioma: "en", raridade: "Common" }),
    ]);
    expect(r.map((c) => c.cartaId)).toEqual(["a-1"]);
  });

  it("inclui rara simples, promo e sem raridade; deixa de fora comum e incomum", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", localId: "1", raridade: "Rara" }),
      linhaCat({ cartaId: "a-2", localId: "2", raridade: "Promo" }),
      linhaCat({ cartaId: "a-3", localId: "3", raridade: null }),
      linhaCat({ cartaId: "a-4", localId: "4", raridade: "Uncommon" }),
      linhaCat({ cartaId: "a-5", localId: "5", raridade: "Comum" }),
    ]);
    expect(r.map((c) => c.cartaId)).toEqual(["a-1", "a-2", "a-3"]);
  });

  it("deixa de fora as comuns e mantém as clássicas", () => {
    const r = selecionarCartasParaPreco([
      linhaCat({ cartaId: "a-1", raridade: "Comum" }),
      linhaCat({ cartaId: "30th-c-001", setId: "30th-c", localId: "001", raridade: "None" }),
    ]);
    expect(r.map((c) => c.cartaId)).toEqual(["30th-c-001"]);
  });
});

describe("escolherLinhaDePreco", () => {
  const carta = { setId: "x", setSigla: "XX", localId: "001" };

  it("reconhece a edição e o número, ignorando zero à esquerda", () => {
    const certa = linhaLiga({ numero: "1" });
    const outra = linhaLiga({ edicaoSigla: "ZZ", numero: "001", preco: 1 });
    expect(escolherLinhaDePreco([outra, certa], carta)).toBe(certa);
  });

  it("reconhece a clássica de 30 anos pela identidade na Liga", () => {
    const charizard = linhaLiga({ edicaoSigla: "30C-C", numero: "004", preco: 900, precoMedio: 1000 });
    const principal = linhaLiga({ edicaoSigla: "30C", numero: "004", preco: 5 });
    const classica = { setId: "30th-c", setSigla: "30C", localId: "001" };
    expect(escolherLinhaDePreco([principal, charizard], classica)).toBe(charizard);
  });

  it("linha sem preço não conta como achada", () => {
    expect(escolherLinhaDePreco([linhaLiga({ preco: null })], carta)).toBeNull();
  });

  it("com duas linhas casando, fica a de menor preço", () => {
    const cara = linhaLiga({ preco: 50 });
    const barata = linhaLiga({ preco: 20 });
    expect(escolherLinhaDePreco([cara, barata], carta)).toBe(barata);
  });
});

describe("separarCartasPorFrescor", () => {
  const agora = new Date("2026-10-05T12:00:00Z");
  const cartas = [{ chave: "a" }, { chave: "b" }, { chave: "c" }];
  const recente = new Date("2026-10-05T08:00:00Z");
  const velha = new Date("2026-10-03T08:00:00Z");

  it("pula a achada e a não achada recentes, consulta a velha e a nunca vista", () => {
    const consultas = new Map([
      ["a", { consultadoEm: recente, encontrada: true, paginasMax: 3 }],
      ["b", { consultadoEm: velha, encontrada: true, paginasMax: 3 }],
    ]);
    const r = separarCartasPorFrescor(cartas, consultas, { agora, validadeHoras: 24, maxPaginas: 3 });
    expect(r.puladas.map((c) => c.chave)).toEqual(["a"]);
    expect(r.pendentes.map((c) => c.chave)).toEqual(["b", "c"]);
  });

  it("não achada com teto menor é refeita; achada não depende do teto", () => {
    const consultas = new Map([
      ["a", { consultadoEm: recente, encontrada: false, paginasMax: 3 }],
      ["b", { consultadoEm: recente, encontrada: true, paginasMax: 3 }],
      ["c", { consultadoEm: recente, encontrada: false, paginasMax: 12 }],
    ]);
    const r = separarCartasPorFrescor(cartas, consultas, { agora, validadeHoras: 24, maxPaginas: 12 });
    expect(r.pendentes.map((c) => c.chave)).toEqual(["a"]);
    expect(r.puladas.map((c) => c.chave)).toEqual(["b", "c"]);
  });
});

describe("ordenação e resumo", () => {
  it("ordena pelo médio, cai no mínimo sem médio, não achada por último", () => {
    const itens = [
      { n: "nada", preco: null, precoMedio: null },
      { n: "min", preco: 80, precoMedio: null },
      { n: "alto", preco: 10, precoMedio: 200 },
      { n: "meio", preco: 50, precoMedio: 90 },
    ];
    expect(itens.sort(compararPorValorDesc).map((i) => i.n)).toEqual(["alto", "meio", "min", "nada"]);
  });

  it("soma só as cartas com preço e conta as não achadas", () => {
    const r = resumirPrecos([
      { encontrada: true, preco: 10, precoMedio: 12.1, precoMaximo: 20 },
      { encontrada: true, preco: 5, precoMedio: null, precoMaximo: null },
      { encontrada: false, preco: null, precoMedio: null, precoMaximo: null },
    ]);
    expect(r).toEqual({ cartasComPreco: 2, naoEncontradas: 1, somaMedios: 17.1 });
  });
});

describe("ordenarJoias", () => {
  it("com preço primeiro (maior valor), depois as sem preço pela vitrine", () => {
    const cartas = [
      { cartaId: "a", raridade: "Ilustração Rara", localId: "001" },
      { cartaId: "b", raridade: "Comum", localId: "001" },
      { cartaId: "c", raridade: "Mega Hiper Raro", localId: "001" },
      { cartaId: "d", raridade: "Rara Holo", localId: "001" },
    ];
    const r = ordenarJoias(cartas, new Map([["b", 500], ["d", 20]]));
    expect(r.map((c) => c.cartaId)).toEqual(["b", "d", "c", "a"]);
  });
});
