import { describe, expect, it } from "vitest";

import {
  caminhoBuscaLiga,
  filtrarCandidatas,
  montarCandidata,
  type FichaCandidata,
} from "./candidatas-compra";

const ficha = (sobrescrever: Partial<FichaCandidata>): FichaCandidata => ({
  cartaId: "sv01-196",
  idioma: "en",
  nome: "Ultra Ball",
  setId: "sv01",
  setNome: "Scarlet & Violet",
  setSigla: "SVI",
  setQtdOficial: 198,
  localId: "196",
  raridade: "Uncommon",
  imagemUrl: null,
  imagemOrigem: null,
  ...sobrescrever,
});

describe("montarCandidata", () => {
  it("usa o nome em inglês na linha e a ficha do idioma preferido na exibição", () => {
    const c = montarCandidata(
      [
        ficha({ idioma: "pt", nome: "Ultra Bola", setNome: "Escarlate e Violeta", raridade: "Incomum" }),
        ficha({}),
      ],
      ["pt", "en"],
    );
    expect(c).toMatchObject({
      cartaId: "sv01-196",
      idiomaCatalogo: "pt",
      nome: "Ultra Ball",
      nomeExibicao: "Ultra Bola",
      edicaoSigla: "SVI",
      edicaoNome: "Escarlate e Violeta",
      numero: "196",
      total: "198",
      raridade: "Incomum",
    });
    expect(c?.idiomas.sort()).toEqual(["en", "pt"]);
  });

  it("sem ficha em inglês, a linha usa o nome que houver", () => {
    const c = montarCandidata([ficha({ idioma: "pt", nome: "Ultra Bola" })], ["pt", "en"]);
    expect(c?.nome).toBe("Ultra Bola");
    expect(c?.nomeExibicao).toBeNull();
  });

  it("escreve o nome e a numeração como a Liga", () => {
    const c = montarCandidata(
      [ficha({ cartaId: "sm3.5-20", nome: "Umbreon GX", localId: "20", setQtdOficial: 73, setSigla: null, setId: "sm3.5" })],
      ["pt", "en"],
    );
    expect(c).toMatchObject({ nome: "Umbreon-GX", numero: "20", total: "73", edicaoSigla: "SM3.5" });
  });

  it("devolve nulo sem ficha", () => {
    expect(montarCandidata([], ["pt", "en"])).toBeNull();
  });
});

describe("caminhoBuscaLiga", () => {
  it("é um caminho relativo da busca deles pelo nome", () => {
    const caminho = caminhoBuscaLiga("Farfetch'd");
    expect(caminho.startsWith("/?view=cards/search&card=")).toBe(true);
    expect(decodeURIComponent(caminho)).toContain("Farfetch'd");
  });
});

describe("filtrarCandidatas", () => {
  const op = (preco: number | null, raridade: string | null, selecionada = false) => ({
    preco,
    raridade,
    selecionada,
  });

  it("o teto esconde só preço conhecido acima dele", () => {
    const { opcoes, descartadas } = filtrarCandidatas(
      [op(5, "Common"), op(30, "Common"), op(null, "Common")],
      { tetoPreco: 20, ordenacao: "preco" },
    );
    expect(opcoes.map((o) => o.preco)).toEqual([5, null]);
    expect(descartadas).toBe(1);
  });

  it("a selecionada nunca some, nem acima do teto", () => {
    const { opcoes } = filtrarCandidatas([op(30, "Common", true)], { tetoPreco: 20, ordenacao: "preco" });
    expect(opcoes).toHaveLength(1);
  });

  it("por preço: mais barata primeiro, sem preço por último", () => {
    const { opcoes } = filtrarCandidatas([op(null, "Rare"), op(9, "Common"), op(2, "Common")], {
      tetoPreco: null,
      ordenacao: "preco",
    });
    expect(opcoes.map((o) => o.preco)).toEqual([2, 9, null]);
  });

  it("por preferência: raridade manda, preço desempata, e a rara sem preço não vai para o topo", () => {
    const { opcoes } = filtrarCandidatas(
      [op(3, "Common"), op(null, "Special Illustration Rare"), op(8, "Rare"), op(4, "Rare")],
      { tetoPreco: null, ordenacao: "preferencia" },
    );
    expect(opcoes.map((o) => `${o.raridade}:${o.preco}`)).toEqual([
      "Rare:4",
      "Rare:8",
      "Common:3",
      "Special Illustration Rare:null",
    ]);
  });
});
