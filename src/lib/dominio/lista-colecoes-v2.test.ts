import { describe, expect, it } from "vitest";

import {
  type ColecaoDaVitrine,
  miniaturasPorColecao,
  montarListaV2,
  progressoDaColecao,
  secoesDaLista,
  serieDistintaDoNome,
} from "./lista-colecoes-v2";

const resolver = {
  imagemDaCarta: (u: string | null) => (u ? `${u}/low.webp` : null),
  spriteDaEspecie: (n: string) => `sprite/${Number(n)}.png`,
};

function colecao(id: string, grupoId: string | null, extra: Partial<ColecaoDaVitrine> = {}): ColecaoDaVitrine {
  return {
    id,
    nome: `Coleção ${id}`,
    tipo: "set",
    parametro: { sets: ["x"], idiomaCatalogo: "pt", incluirSecretas: false },
    idiomaExigido: null,
    totalVagas: 10,
    vagasPreenchidas: 4,
    grupoId,
    capa: null,
    logos: [],
    ...extra,
  };
}

describe("secoesDaLista", () => {
  it("mantém a ordem dos grupos e a dos itens, sem ordenar de novo", () => {
    const grupos = [{ id: "g2" }, { id: "g1" }];
    const itens = [
      { id: "a", grupoId: "g2" },
      { id: "b", grupoId: "g1" },
      { id: "c", grupoId: "g2" },
      { id: "d", grupoId: null },
    ];
    const secoes = secoesDaLista(itens, grupos);
    expect(secoes.map((s) => s.grupo?.id ?? null)).toEqual(["g2", "g1", null]);
    expect(secoes.map((s) => s.colecoes.map((c) => c.id))).toEqual([["a", "c"], ["b"], ["d"]]);
  });

  it("deixa o grupo sem coleção na lista e omite 'sem grupo' quando ele está vazio", () => {
    const secoes = secoesDaLista([{ id: "a", grupoId: "g1" }], [{ id: "g1" }, { id: "g2" }]);
    expect(secoes.map((s) => [s.grupo?.id, s.colecoes.length])).toEqual([
      ["g1", 1],
      ["g2", 0],
    ]);
  });

  it("manda para 'sem grupo' a coleção cujo grupo a leitura dos grupos não trouxe", () => {
    const secoes = secoesDaLista([{ id: "a", grupoId: "sumiu" }], [{ id: "g1" }]);
    expect(secoes.at(-1)).toEqual({ grupo: null, colecoes: [{ id: "a", grupoId: "sumiu" }] });
  });

  it("sem nenhum grupo, a lista é uma seção só, sem grupo", () => {
    const secoes = secoesDaLista(
      [
        { id: "a", grupoId: null },
        { id: "b", grupoId: null },
      ],
      [],
    );
    expect(secoes).toHaveLength(1);
    expect(secoes[0].grupo).toBeNull();
    expect(secoes[0].colecoes.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("lista vazia dá zero seções", () => {
    expect(secoesDaLista([], [])).toEqual([]);
  });
});

describe("progressoDaColecao", () => {
  it("customizada só conta o que foi alocado, sem denominador", () => {
    expect(progressoDaColecao({ tipo: "customizada", totalVagas: 12, vagasPreenchidas: 12 })).toEqual({
      tipo: "contagem",
      quantas: 12,
    });
  });

  it("calcula o percentual para baixo e diz quantas faltam", () => {
    expect(progressoDaColecao({ tipo: "set", totalVagas: 200, vagasPreenchidas: 199 })).toEqual({
      tipo: "anel",
      percentual: 99,
      faltam: 1,
      completa: false,
    });
    expect(progressoDaColecao({ tipo: "pokedex", totalVagas: 151, vagasPreenchidas: 91 })).toMatchObject({
      percentual: 60,
      faltam: 60,
    });
  });

  it("só chega a 100 quando nada falta", () => {
    expect(progressoDaColecao({ tipo: "set", totalVagas: 3, vagasPreenchidas: 3 })).toEqual({
      tipo: "anel",
      percentual: 100,
      faltam: 0,
      completa: true,
    });
    // 995 de 1000 não arredonda para 100.
    expect(progressoDaColecao({ tipo: "set", totalVagas: 1000, vagasPreenchidas: 999 })).toMatchObject({
      percentual: 99,
    });
  });

  it("coleção sem nenhuma vaga não vira 0% nem NaN", () => {
    expect(progressoDaColecao({ tipo: "set", totalVagas: 0, vagasPreenchidas: 0 })).toEqual({ tipo: "semVagas" });
  });

  it("não deixa uma contagem fora de faixa passar de 100 ou ficar negativa", () => {
    expect(progressoDaColecao({ tipo: "set", totalVagas: 5, vagasPreenchidas: 9 })).toMatchObject({
      percentual: 100,
      faltam: 0,
    });
    expect(progressoDaColecao({ tipo: "set", totalVagas: 5, vagasPreenchidas: -2 })).toMatchObject({
      percentual: 0,
      faltam: 5,
    });
  });
});

describe("miniaturasPorColecao", () => {
  it("usa a primeira entrada de cada coleção (a mais perto de fechar)", () => {
    const mapa = miniaturasPorColecao(
      [
        { colecaoId: "a", tipo: "set", faltantes: [{ chave: "sv3/006", imagemUrl: "cdn/6" }] },
        { colecaoId: "a", tipo: "set", faltantes: [{ chave: "sv3/099", imagemUrl: "cdn/99" }] },
      ],
      resolver,
      4,
    );
    expect(mapa.get("a")).toEqual([{ url: "cdn/6/low.webp", rotulo: "006", silhueta: false }]);
  });

  it("na Pokédex a miniatura é o sprite da espécie, desenhado como silhueta", () => {
    const mapa = miniaturasPorColecao(
      [{ colecaoId: "p", tipo: "pokedex", faltantes: [{ chave: "025", imagemUrl: null }] }],
      resolver,
      4,
    );
    expect(mapa.get("p")).toEqual([{ url: "sprite/25.png", rotulo: "025", silhueta: true }]);
  });

  it("corta no número pedido e aceita vaga sem imagem", () => {
    const mapa = miniaturasPorColecao(
      [
        {
          colecaoId: "a",
          tipo: "set",
          faltantes: [
            { chave: "x/1", imagemUrl: null },
            { chave: "x/2", imagemUrl: "cdn/2" },
            { chave: "x/3", imagemUrl: "cdn/3" },
          ],
        },
      ],
      resolver,
      2,
    );
    expect(mapa.get("a")).toHaveLength(2);
    expect(mapa.get("a")?.[0].url).toBeNull();
  });
});

describe("montarListaV2", () => {
  it("monta as seções na ordem recebida, com tema, avisos, capa e miniaturas", () => {
    const vitrine = [
      colecao("a", "g1", {
        capa: { nome: "Carta", imagemUrl: "cdn/c" },
        avisoCatalogoIncompleto: { sets: [] },
      }),
      colecao("b", null, {
        tipo: "customizada",
        parametro: { tema: { tipo: "tipo", valor: "Fire" } },
        totalVagas: 3,
        vagasPreenchidas: 3,
      }),
    ];
    const lista = montarListaV2(
      vitrine,
      [{ id: "g1", nome: "Grupo", serieId: "sv", serieRotulo: "Escarlate e Violeta" }],
      new Map([["a", [{ url: "u", rotulo: "001", silhueta: false }]]]),
      resolver,
    );
    expect(lista.totalColecoes).toBe(2);
    expect(lista.secoes.map((s) => s.grupo?.nome ?? null)).toEqual(["Grupo", null]);
    // A série vai junto: é ela que acende as ações em lote do grupo no modo "Organizar".
    expect(lista.secoes[0].grupo).toEqual({ id: "g1", nome: "Grupo", serieId: "sv", serieRotulo: "Escarlate e Violeta" });
    const a = lista.secoes[0].colecoes[0];
    expect(a.capa).toEqual({ nome: "Carta", url: "cdn/c/low.webp" });
    expect(a.avisoCatalogoIncompleto).toBe(true);
    expect(a.avisoSemNumeracaoOficial).toBe(false);
    expect(a.miniaturas).toHaveLength(1);
    const b = lista.secoes[1].colecoes[0];
    expect(b.tema).toEqual({ tipo: "tipo", valor: "Fire", rotulo: undefined });
    expect(b.miniaturas).toEqual([]);
  });

  it("uma capa sem URL resolvida some em vez de virar imagem quebrada", () => {
    const lista = montarListaV2(
      [colecao("a", null, { capa: { nome: "Carta", imagemUrl: "" } })],
      [],
      new Map(),
      { imagemDaCarta: () => null },
    );
    expect(lista.secoes[0].colecoes[0].capa).toBeNull();
  });
});

describe("serieDistintaDoNome", () => {
  it("omite a série que repete o nome do grupo, sem olhar caixa nem espaço", () => {
    expect(serieDistintaDoNome({ id: "g", nome: " Escarlate e Violeta ", serieRotulo: "escarlate e violeta" })).toBeNull();
  });
  it("mantém a que diz outra coisa e ignora a vazia", () => {
    expect(serieDistintaDoNome({ id: "g", nome: "Meus sets", serieRotulo: "Megaevolução" })).toBe("Megaevolução");
    expect(serieDistintaDoNome({ id: "g", nome: "Meus sets", serieRotulo: "  " })).toBeNull();
    expect(serieDistintaDoNome({ id: "g", nome: "Meus sets", serieRotulo: null })).toBeNull();
  });
});
