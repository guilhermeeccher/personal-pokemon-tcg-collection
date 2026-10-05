import { describe, expect, it } from "vitest";

import type { LinhaBuscaLiga } from "./liga-busca";
import {
  deveBuscarProximaPaginaSet,
  edicaoCasaComSet,
  linhaCasaComVagaSet,
  normalizarNumeroCarta,
  type AlvoVagaSet,
} from "./liga-set";

function linha(parcial: Partial<LinhaBuscaLiga> = {}): LinhaBuscaLiga {
  return {
    nome: "Lokix",
    edicaoSigla: "PFL",
    edicaoId: 738,
    edicaoNome: "Phantasmal Flames",
    numero: "010",
    total: "130",
    preco: 1.5,
    precoMedio: 2,
    precoMaximo: 4,
    caminho: "/?view=cards/card&card=Lokix (010/130)&ed=PFL&num=010",
    ...parcial,
  };
}

const pfl: AlvoVagaSet = { numero: "010", setId: "me02", setSigla: "PFL" };

describe("normalizarNumeroCarta", () => {
  it("iguala o zero à esquerda dos dois lados", () => {
    expect(normalizarNumeroCarta("010")).toBe(normalizarNumeroCarta("10"));
    expect(normalizarNumeroCarta("001")).toBe("1");
  });

  it("preserva o sufixo de variante, que é parte do número", () => {
    // "073p" e "073" são cartas diferentes no catálogo deles; colapsar as duas
    // colocaria a opção da vaga errada.
    expect(normalizarNumeroCarta("073p")).toBe("73P");
    expect(normalizarNumeroCarta("073p")).not.toBe(normalizarNumeroCarta("073"));
    expect(normalizarNumeroCarta("TG01")).toBe("TG01");
  });
});

describe("edicaoCasaComSet", () => {
  it("casa pela sigla oficial do nosso catálogo", () => {
    expect(edicaoCasaComSet(linha(), pfl)).toBe(true);
    expect(edicaoCasaComSet(linha({ edicaoSigla: "pfl" }), pfl)).toBe(true);
  });

  it("casa pelo set_id quando o set não tem sigla (japonês)", () => {
    const japones: AlvoVagaSet = { numero: "001", setId: "sv2a", setSigla: null };
    expect(edicaoCasaComSet(linha({ edicaoSigla: "SV2a", edicaoId: null }), japones)).toBe(true);
  });

  it("recusa edição de outro set", () => {
    expect(edicaoCasaComSet(linha({ edicaoSigla: "MEG", edicaoId: 730 }), pfl)).toBe(false);
  });

  it("dá precedência ao vínculo confirmado, nos dois sentidos", () => {
    const vinculo = new Map([[738, "me02"]]);
    // Vínculo aponta para o nosso set: casa mesmo com sigla diferente da nossa.
    expect(edicaoCasaComSet(linha({ edicaoSigla: "OUTRA" }), pfl, vinculo)).toBe(true);

    // Vínculo aponta para outro set: a sigla coincidente NÃO pode salvar a
    // linha. Preço de um set apontado para carta de outro é o erro que a
    // tabela `liga_edicao` existe para evitar.
    const paraOutro = new Map([[738, "me05"]]);
    expect(edicaoCasaComSet(linha(), pfl, paraOutro)).toBe(false);
  });

  it("não casa por sigla vazia", () => {
    expect(edicaoCasaComSet(linha({ edicaoSigla: "", edicaoId: null }), pfl)).toBe(false);
  });
});

describe("linhaCasaComVagaSet", () => {
  it("exige edição e número", () => {
    expect(linhaCasaComVagaSet(linha(), pfl)).toBe(true);
    expect(linhaCasaComVagaSet(linha({ numero: "10" }), pfl)).toBe(true);
    expect(linhaCasaComVagaSet(linha({ numero: "011" }), pfl)).toBe(false);
    expect(linhaCasaComVagaSet(linha({ edicaoSigla: "MEG", edicaoId: 730 }), pfl)).toBe(false);
  });
});

describe("Coleção Clássica de 30 Anos", () => {
  const delcattyClassica: AlvoVagaSet = { numero: "002", setId: "30th-c", setSigla: "30C" };
  const cartaPrincipal: AlvoVagaSet = { numero: "005", setId: "30th", setSigla: "30C" };
  const misty = { numero: "005", setId: "30th-c", setSigla: "30C" };
  const classica = (numero: string) =>
    linha({ edicaoSigla: "30C-C", edicaoId: 805, numero, total: "30" });

  it("a linha 30C-C 005 casa com a Delcatty clássica (30th-c-002)", () => {
    expect(linhaCasaComVagaSet(classica("005"), delcattyClassica)).toBe(true);
  });

  it("a linha 30C 005 casa com o set principal e NÃO com a Misty clássica", () => {
    const principal = linha({ edicaoSigla: "30C", edicaoId: null, numero: "005" });
    expect(linhaCasaComVagaSet(principal, cartaPrincipal)).toBe(true);
    expect(linhaCasaComVagaSet(principal, misty)).toBe(false);
  });

  it("a linha 30C-C 005 não casa com a Misty clássica, que é a 018", () => {
    expect(linhaCasaComVagaSet(classica("005"), misty)).toBe(false);
    expect(linhaCasaComVagaSet(classica("018"), misty)).toBe(true);
  });

  it("o número do catálogo (002) não casa mais com a linha da clássica", () => {
    expect(linhaCasaComVagaSet(classica("002"), delcattyClassica)).toBe(false);
  });

  it("a linha 30C-C não casa com o set principal", () => {
    expect(linhaCasaComVagaSet(classica("005"), cartaPrincipal)).toBe(false);
  });
});

describe("deveBuscarProximaPaginaSet", () => {
  it("para assim que a carta aparece", () => {
    expect(deveBuscarProximaPaginaSet({ blocos: 40, achou: true })).toBe(false);
  });

  it("continua enquanto a página vier cheia e a carta não apareceu", () => {
    // A ordenação é por preço crescente, então a carta do set pode estar na
    // última página — parar por preço aqui a esconderia.
    expect(deveBuscarProximaPaginaSet({ blocos: 40, achou: false })).toBe(true);
    expect(deveBuscarProximaPaginaSet({ blocos: 39, achou: false })).toBe(false);
  });
});
