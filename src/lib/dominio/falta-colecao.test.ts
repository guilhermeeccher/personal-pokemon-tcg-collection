import { describe, expect, it } from "vitest";

import { filtrarCandidatas } from "./candidatas-compra";
import {
  lerCriterioDaUrl,
  montarVagasDaFalta,
  opcaoDaCandidata,
  opcaoDaVarredura,
  propostaDaVaga,
  type OpcaoFalta,
  type OpcaoLigaParaFalta,
} from "./falta-colecao";
import type { OpcaoCandidata } from "./opcoes-compra-vaga";

// Dados inventados: nomes, números e preços não vêm de nenhuma coleção.

const candidata = (sobrescrever: Partial<OpcaoCandidata> & { preco?: number | null }): OpcaoCandidata => {
  const { preco = null, ...resto } = sobrescrever;
  const base = {
    id: "1|xx-001",
    chave: "1",
    nome: "Monstrinho",
    edicaoNome: "Edição Inventada",
    numero: "001",
    total: "100",
    raridade: "Comum",
    cartaId: "xx-001",
    selecionada: false,
    semEstoque: false,
    imagemUrl: null,
    imagemOrigem: null,
    ...resto,
  };
  return preco === null
    ? { ...base, preco: null }
    : {
        ...base,
        preco,
        cardmarket: { valorEur: preco / 5, criterioValor: "tendencia", cotacao: 5, cotacaoData: "2026-11-20" },
      };
};

const liga = (sobrescrever: Partial<OpcaoLigaParaFalta>): OpcaoLigaParaFalta => ({
  id: "op1",
  nome: "Monstrinho",
  edicaoNome: "Edição Inventada",
  numero: "001",
  total: "100",
  raridade: null,
  cartaId: null,
  preco: 4.5,
  imagemUrl: null,
  imagemOrigem: null,
  selecionada: false,
  semEstoque: false,
  ...sobrescrever,
});

const precos = new Map([["xx-002", { precoEm: new Date("2026-11-19T00:00:00Z") }]]);

describe("opcaoDaCandidata", () => {
  it("candidata do catálogo: marca por { chave, cartaId }, preço com fonte, data e cotação", () => {
    const o = opcaoDaCandidata(candidata({ id: "1|xx-002", cartaId: "xx-002", preco: 10 }), precos);
    expect(o).toMatchObject({
      alvo: { tipo: "candidata", chave: "1", cartaId: "xx-002" },
      preco: {
        fonte: "cardmarket",
        valor: 10,
        em: "2026-11-19T00:00:00.000Z",
        cardmarket: { valorEur: 2, cotacao: 5, cotacaoData: "2026-11-20" },
      },
    });
    expect(o).not.toHaveProperty("imagemUrl");
  });

  it("escolha avulsa: só desmarca, pelo id da escolha", () => {
    const o = opcaoDaCandidata(
      candidata({ id: "escolha|e9", escolhaId: "e9", cartaId: null, selecionada: true }),
      precos,
    );
    expect(o.alvo).toEqual({ tipo: "escolha", escolhaId: "e9" });
    expect(o.preco).toBeNull();
  });

  it("perguntada sem preço: diz quando", () => {
    const o = opcaoDaCandidata(candidata({ consultadaEm: "2026-11-18T00:00:00.000Z" }), precos);
    expect(o).toMatchObject({ preco: null, consultadaSemPrecoEm: "2026-11-18T00:00:00.000Z" });
  });
});

describe("opcaoDaVarredura", () => {
  it("marca pelo id da opção; preço da Liga sem conversão, com a data da varredura", () => {
    const o = opcaoDaVarredura(liga({}), new Date("2026-11-10T00:00:00Z"));
    expect(o).toMatchObject({
      alvo: { tipo: "opcaoLiga", id: "op1" },
      preco: { fonte: "liga", valor: 4.5, em: "2026-11-10T00:00:00.000Z" },
    });
    expect(o.preco).not.toHaveProperty("cardmarket");
  });
});

describe("propostaDaVaga — o atalho 'marcar a melhor de cada vaga'", () => {
  const conv = (o: OpcaoCandidata) => opcaoDaCandidata(o, precos);

  it("sem opção", () => {
    expect(propostaDaVaga([])).toEqual({ semProposta: "semOpcao" });
  });

  it("a primeira na ordem do critério, quando tem preço", () => {
    // Na ordem de `filtrarCandidatas` por preferência: a rara primeiro, preço desempata.
    const { opcoes } = filtrarCandidatas(
      [
        candidata({ id: "a", cartaId: "a", raridade: "Comum", preco: 1 }),
        candidata({ id: "b", cartaId: "b", raridade: "Rara", preco: 8 }),
        candidata({ id: "c", cartaId: "c", raridade: "Ultra Rara", preco: null }),
      ],
      { tetoPreco: 20, ordenacao: "preferencia" },
    );
    const r = propostaDaVaga(opcoes.map(conv));
    expect("proposta" in r && r.proposta.id).toBe("b");
  });

  it("vaga que já tem escolha não recebe proposta (o atalho só marca vaga sem nada)", () => {
    const r = propostaDaVaga([
      conv(candidata({ id: "a", cartaId: "a", preco: 1 })),
      conv(candidata({ id: "b", cartaId: "b", preco: 2, selecionada: true })),
    ]);
    expect(r).toEqual({ semProposta: "jaTemEscolha" });
  });

  it("vaga com escolha que nenhuma opção explica também não recebe proposta (Liga com escolha do catálogo)", () => {
    const r = propostaDaVaga([opcaoDaVarredura(liga({ id: "x" }), null)], 1);
    expect(r).toEqual({ semProposta: "jaTemEscolha" });
  });

  it("Cardmarket antes da busca de preços: sem proposta, marcável à mão", () => {
    const r = propostaDaVaga([conv(candidata({ id: "a", cartaId: "a" }))]);
    expect(r).toEqual({ semProposta: "semPreco" });
  });

  it("Liga: a primeira opção da varredura", () => {
    const r = propostaDaVaga([opcaoDaVarredura(liga({ id: "x" }), null), opcaoDaVarredura(liga({ id: "y" }), null)]);
    expect("proposta" in r && r.proposta.alvo).toEqual({ tipo: "opcaoLiga", id: "x" });
  });

  it("o teto esconde só preço conhecido acima dele; a marcada nunca some", () => {
    const { opcoes, descartadas } = filtrarCandidatas(
      [
        candidata({ id: "cara", cartaId: "cara", preco: 50 }),
        candidata({ id: "marcada", cartaId: "m", preco: 99, selecionada: true }),
        candidata({ id: "semPreco", cartaId: "s" }),
      ],
      { tetoPreco: 20, ordenacao: "preco" },
    );
    expect(opcoes.map((o) => o.id)).toEqual(["marcada", "semPreco"]);
    expect(descartadas).toBe(1);
  });
});

describe("montarVagasDaFalta", () => {
  const proposta: OpcaoFalta = opcaoDaVarredura(liga({ id: "p" }), null);

  it("toda vaga vazia vem (regra 6), inclusive sem opção nem rótulo conhecido", () => {
    const vagas = montarVagasDaFalta(
      [
        { vagaId: "v1", chave: "xx/001", livres: 1 },
        { vagaId: "v2", chave: "xx/002", livres: 0 },
        { vagaId: "v3", chave: "xx/003", livres: 0 },
      ],
      new Map([
        ["xx/001", { rotulo: "Um", dex: null, setNome: "Inventado", opcoes: [proposta], descartadas: 2, semEstoque: 1 }],
      ]),
      new Map([["xx/002", { rotulo: "Dois", dex: null, setNome: "Inventado" }]]),
      new Map([
        [
          "xx/002",
          [
            {
              escolhaId: "e1",
              cartaId: null,
              nome: "Dois",
              edicaoNome: "Antiga",
              numero: "2",
              total: null,
              raridade: null,
              preco: null,
            },
          ],
        ],
      ]),
    );
    expect(vagas).toEqual([
      expect.objectContaining({
        vagaId: "v1",
        numero: "001",
        rotulo: "Um",
        livres: 1,
        opcoes: 1,
        descartadas: 2,
        semEstoque: 1,
        proposta,
        escolhas: [],
      }),
      expect.objectContaining({ vagaId: "v2", numero: "002", rotulo: "Dois", opcoes: 0, proposta: null, semProposta: "semOpcao" }),
      expect.objectContaining({ vagaId: "v3", rotulo: null, opcoes: 0, semProposta: "semOpcao" }),
    ]);
    expect(vagas[1].escolhas.map((e) => e.escolhaId)).toEqual(["e1"]);
    // A escolha da vaga 2 travaria a proposta mesmo que houvesse opção.
    expect(vagas[0]).not.toHaveProperty("semProposta");
  });
});

describe("montarVagasDaFalta — escolha atual trava a proposta", () => {
  it("opção sem marca, mas a vaga já tem escolha: sem proposta, e a escolha vem identificável", () => {
    const [v] = montarVagasDaFalta(
      [{ vagaId: "v1", chave: "4", livres: 0 }],
      new Map([
        ["4", { rotulo: "Brasinha", dex: 4, setNome: null, opcoes: [opcaoDaVarredura(liga({ id: "o" }), null)], descartadas: 0, semEstoque: 0 }],
      ]),
      new Map(),
      new Map([
        [
          "4",
          [{ escolhaId: "e1", cartaId: "xx-004", nome: "Brasinha", edicaoNome: "X", numero: "4", total: "9", raridade: null, preco: null }],
        ],
      ]),
    );
    expect(v).toMatchObject({ proposta: null, semProposta: "jaTemEscolha", opcoes: 1 });
    expect(v.escolhas[0].escolhaId).toBe("e1");
  });
});

describe("lerCriterioDaUrl", () => {
  const padrao = { ordenacao: "preferencia" as const, tetoPreco: 20 };

  it("sem parâmetros: o padrão da tela de opções", () => {
    expect(lerCriterioDaUrl(new URLSearchParams(), padrao, null)).toEqual({
      ok: true,
      ordenacao: "preferencia",
      tetoPreco: 20,
      pedido: false,
    });
  });

  it("teto vazio é sem teto; ordenação pedida vale, salvo a fixa do set", () => {
    expect(lerCriterioDaUrl(new URLSearchParams("teto=&ordenacao=preco"), padrao, null)).toMatchObject({
      ordenacao: "preco",
      tetoPreco: null,
      pedido: true,
    });
    expect(lerCriterioDaUrl(new URLSearchParams("ordenacao=preferencia"), padrao, "preco")).toMatchObject({
      ordenacao: "preco",
    });
  });

  it("recusa ordenação desconhecida e teto que não é número positivo", () => {
    for (const q of ["ordenacao=raridade", "teto=0", "teto=-1", "teto=abc"]) {
      expect(lerCriterioDaUrl(new URLSearchParams(q), padrao, null)).toEqual({ ok: false });
    }
  });
});
