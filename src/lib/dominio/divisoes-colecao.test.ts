import { describe, expect, it } from "vitest";

import {
  calcularDivisoes,
  type Divisao,
  parteDoLocalId,
  selecionarQuaseLa,
} from "./divisoes-colecao";

function vagas(chaves: string[], preenchidas: string[] = []) {
  return chaves.map((chave) => ({ chave, preenchida: preenchidas.includes(chave) }));
}

function faixa(setId: string, de: number, ate: number): string[] {
  const chaves: string[] = [];
  for (let n = de; n <= ate; n++) chaves.push(`${setId}/${String(n).padStart(3, "0")}`);
  return chaves;
}

const resumo = (d: Divisao) => [d.id, d.preenchidas, d.total];

describe("parteDoLocalId", () => {
  it("até a numeração oficial é principal; acima dela, secreta", () => {
    expect(parteDoLocalId("128", 128)).toBe("principal");
    expect(parteDoLocalId("129", 128)).toBe("secretas");
  });

  it("número com letra é sempre secreta", () => {
    expect(parteDoLocalId("B", 128)).toBe("secretas");
    expect(parteDoLocalId("TG01", 128)).toBe("secretas");
  });
});

describe("calcularDivisoes — set", () => {
  const oficial = new Map([
    ["sa", 10],
    ["sb", 0],
  ]);

  it("set da receita com secretas ligadas se parte em principal e secretas", () => {
    const { divisoes, divisaoPorChave } = calcularDivisoes({
      tipo: "set",
      parametro: { sets: ["sa"], idiomaCatalogo: "pt", incluirSecretas: true },
      vagas: vagas([...faixa("sa", 1, 12), "sa/B"], ["sa/001", "sa/011", "sa/B"]),
      qtdOficialPorSet: oficial,
      nomePorSet: new Map([["sa", "Set A"]]),
    });
    expect(divisoes.map(resumo)).toEqual([
      ["set:sa:principal", 1, 10],
      ["set:sa:secretas", 2, 3],
    ]);
    expect(divisoes[0]).toMatchObject({ setNome: "Set A", parte: "principal" });
    expect(divisaoPorChave.get("sa/B")).toBe("set:sa:secretas");
    expect(divisaoPorChave.get("sa/010")).toBe("set:sa:principal");
  });

  it("secretas desligadas: o set é uma divisão inteira", () => {
    const { divisoes } = calcularDivisoes({
      tipo: "set",
      parametro: { sets: ["sa"], idiomaCatalogo: "pt", incluirSecretas: false },
      vagas: vagas(faixa("sa", 1, 10), ["sa/001"]),
      qtdOficialPorSet: oficial,
    });
    expect(divisoes.map(resumo)).toEqual([["set:sa", 1, 10]]);
    expect(divisoes[0]).toMatchObject({ setNome: "sa", parte: "inteiro" });
  });

  it("com as secretas todas excluídas, o set volta a ser inteiro", () => {
    const { divisoes } = calcularDivisoes({
      tipo: "set",
      parametro: { sets: ["sa"], idiomaCatalogo: "pt", incluirSecretas: true },
      vagas: vagas(faixa("sa", 1, 10)),
      qtdOficialPorSet: oficial,
    });
    expect(divisoes.map(resumo)).toEqual([["set:sa", 0, 10]]);
  });

  it("set sem numeração oficial e set de carta avulsa nunca se partem; ordem é receita, depois avulsos", () => {
    const { divisoes } = calcularDivisoes({
      tipo: "set",
      parametro: { sets: ["sa", "sb"], idiomaCatalogo: "pt", incluirSecretas: true },
      vagas: vagas(
        ["zz/050", "sb/001", "sb/002", "mep/099", ...faixa("sa", 1, 11)],
        ["sb/001"],
      ),
      qtdOficialPorSet: new Map([...oficial, ["zz", 5]]),
    });
    expect(divisoes.map((d) => d.id)).toEqual([
      "set:sa:principal",
      "set:sa:secretas",
      "set:sb",
      "set:mep",
      "set:zz",
    ]);
    expect(divisoes.find((d) => d.id === "set:sb")).toMatchObject({ total: 2, preenchidas: 1 });
  });
});

describe("calcularDivisoes — pokédex e customizada", () => {
  it("pokédex divide por região, na ordem canônica", () => {
    const { divisoes, divisaoPorChave } = calcularDivisoes({
      tipo: "pokedex",
      parametro: { escopo: "regioes", regioes: ["kanto", "johto"] },
      vagas: vagas(["152", "1", "2"], ["1"]),
      qtdOficialPorSet: new Map(),
    });
    expect(divisoes.map(resumo)).toEqual([
      ["regiao:kanto", 1, 2],
      ["regiao:johto", 0, 1],
    ]);
    expect(divisaoPorChave.get("152")).toBe("regiao:johto");
  });

  it("customizada não tem divisão", () => {
    const { divisoes } = calcularDivisoes({
      tipo: "customizada",
      parametro: null,
      vagas: vagas(["1", "2"], ["1", "2"]),
      qtdOficialPorSet: new Map(),
    });
    expect(divisoes).toEqual([]);
  });
});

describe("selecionarQuaseLa", () => {
  function divisao(id: string, preenchidas: number, total: number): Divisao {
    return { id, tipo: "set", setId: id, setNome: id, parte: "inteiro", preenchidas, total };
  }

  it("ignora divisão não começada e divisão fechada; ordena por percentual e corta no limite", () => {
    const quaseLa = selecionarQuaseLa(
      [
        { id: "c1", divisoes: [divisao("a", 108, 128), divisao("zero", 0, 4)] },
        { id: "c2", divisoes: [divisao("b", 101, 132), divisao("cheia", 84, 84)] },
        { id: "c3", divisoes: [divisao("c", 3, 30)] },
      ],
      2,
    );
    expect(quaseLa.map((q) => [q.colecaoId, q.divisao.id, q.faltam])).toEqual([
      ["c1", "a", 20],
      ["c2", "b", 31],
    ]);
  });

  it("no empate de percentual, a que falta menos vem primeiro", () => {
    const quaseLa = selecionarQuaseLa(
      [{ id: "c", divisoes: [divisao("grande", 50, 100), divisao("pequena", 5, 10)] }],
      5,
    );
    expect(quaseLa.map((q) => q.divisao.id)).toEqual(["pequena", "grande"]);
  });
});
