import { describe, expect, it } from "vitest";

import { type ColecaoFaltaGeral, entraNaFalta, montarFaltaGeral, vagasVazias } from "./falta-geral";

/* Dados inventados. */

const vaga = (id: string, chave: string, copiaId: string | null, livres = 0) => ({
  id,
  chave,
  copiaId,
  cartaNome: null,
  nomeEspecie: `Espécie ${chave}`,
  imagemUrl: null,
  imagemOrigem: null,
  candidatosDisponiveis: livres,
});

describe("o que falta, todas as coleções", () => {
  it("entram Pokédex e set com vaga vazia; customizada e coleção completa ficam de fora", () => {
    expect(entraNaFalta({ tipo: "pokedex", totalVagas: 151, vagasPreenchidas: 150 })).toBe(true);
    expect(entraNaFalta({ tipo: "set", totalVagas: 10, vagasPreenchidas: 10 })).toBe(false);
    expect(entraNaFalta({ tipo: "customizada", totalVagas: 3, vagasPreenchidas: 0 })).toBe(false);
  });

  it("só as vagas vazias, na ordem da coleção, com o número legível e as livres", () => {
    const v = vagasVazias([vaga("a", "1", "copia"), vaga("b", "2", null, 2), vaga("c", "sv1/007", null)]);
    expect(v.map((x) => [x.id, x.numero, x.livres])).toEqual([
      ["b", "2", 2],
      ["c", "007", 0],
    ]);
  });

  it("o filtro mostra só o que dá para alocar e esconde a coleção sem nenhuma; os totais não mudam", () => {
    const colecoes: ColecaoFaltaGeral[] = [
      { id: "p", nome: "Pokédex", tipo: "pokedex", vagas: vagasVazias([vaga("a", "1", null, 1), vaga("b", "2", null)]) },
      { id: "s", nome: "Set", tipo: "set", vagas: vagasVazias([vaga("c", "x/1", null)]) },
    ];
    const todas = montarFaltaGeral(colecoes, false);
    expect(todas.totalVagas).toBe(3);
    expect(todas.totalAlocaveis).toBe(1);
    expect(todas.grupos.map((g) => [g.colecao.id, g.exibidas.length, g.alocaveis])).toEqual([
      ["p", 2, 1],
      ["s", 1, 0],
    ]);

    const soAlocaveis = montarFaltaGeral(colecoes, true);
    expect(soAlocaveis.totalVagas).toBe(3);
    expect(soAlocaveis.grupos.map((g) => [g.colecao.id, g.exibidas.map((v) => v.id)])).toEqual([["p", ["a"]]]);
  });

  it("mantém a ordem recebida das coleções (a de listarColecoes)", () => {
    const colecoes: ColecaoFaltaGeral[] = ["z", "a", "m"].map((id) => ({ id, nome: id, tipo: "set", vagas: vagasVazias([vaga(id, "x/1", null)]) }));
    expect(montarFaltaGeral(colecoes, false).grupos.map((g) => g.colecao.id)).toEqual(["z", "a", "m"]);
  });
});
