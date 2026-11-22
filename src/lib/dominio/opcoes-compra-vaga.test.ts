import { describe, expect, it } from "vitest";

import type { CartaCandidata } from "./candidatas-compra";
import {
  ofertarCandidatas,
  ofertarOpcoesDaVarredura,
  precoDaOpcao,
  resumirPrecosDasCandidatas,
  vagasComVariasEscolhas,
  type EscolhaParaOpcoes,
  type PrecoParaOpcoes,
} from "./opcoes-compra-vaga";

// Dados inventados: nomes, números e preços não vêm de nenhuma coleção.

const candidata = (sobrescrever: Partial<CartaCandidata>): CartaCandidata => ({
  cartaId: "xx1-001",
  idiomaCatalogo: "pt",
  idiomas: ["pt", "en"],
  nome: "Monstrinho",
  nomeExibicao: null,
  edicaoSigla: "XX1",
  edicaoNome: "Edição Inventada",
  numero: "001",
  total: "100",
  raridade: "Comum",
  imagemUrl: null,
  imagemOrigem: null,
  caminho: "/?view=cards/search&card=Monstrinho",
  ...sobrescrever,
});

const escolha = (sobrescrever: Partial<EscolhaParaOpcoes>): EscolhaParaOpcoes => ({
  id: "e1",
  chave: "1",
  identidade: "sigla:XX1/1",
  especie: "Monstrinho",
  nome: "Monstrinho",
  edicaoNome: "Edição Inventada",
  numero: "001",
  total: "100",
  caminho: "/c",
  cartaId: "xx1-001",
  raridade: "Comum",
  vagaVazia: true,
  ...sobrescrever,
});

const preco = (sobrescrever: Partial<PrecoParaOpcoes>): PrecoParaOpcoes => ({
  valor: 10,
  valorEur: 2,
  criterioValor: "tendencia",
  tendenciaEur: 2,
  cotacao: 5,
  cotacaoData: "2026-11-20",
  consultadoEm: new Date("2026-11-21T10:00:00Z"),
  ...sobrescrever,
});

describe("vagasComVariasEscolhas", () => {
  it("lista só as vagas com mais de uma escolha, na ordem das chaves", () => {
    const r = vagasComVariasEscolhas([
      { chave: "10", especie: "B", nome: "b1" },
      { chave: "2", especie: "A", nome: "a1" },
      { chave: "10", especie: "B", nome: "b2" },
      { chave: "2", especie: null, nome: "a2" },
      { chave: "3", especie: "C", nome: "c" },
    ]);
    expect(r).toEqual([
      { chave: "2", rotulo: "A", quantidade: 2 },
      { chave: "10", rotulo: "B", quantidade: 2 },
    ]);
  });
});

describe("precoDaOpcao", () => {
  it("sem linha de preço: só preco nulo", () => {
    expect(precoDaOpcao(new Map(), "xx1-001")).toEqual({ preco: null });
    expect(precoDaOpcao(new Map([["xx1-001", preco({})]]), null)).toEqual({ preco: null });
  });

  it("perguntada sem preço: diz quando perguntou", () => {
    const p = precoDaOpcao(new Map([["a", preco({ valor: null })]]), "a");
    expect(p).toEqual({ preco: null, consultadaEm: "2026-11-21T10:00:00.000Z" });
  });

  it("a tendência só vai quando foi trocada pela média de 30 dias", () => {
    expect(precoDaOpcao(new Map([["a", preco({})]]), "a")).toEqual({
      preco: 10,
      cardmarket: { valorEur: 2, criterioValor: "tendencia", cotacao: 5, cotacaoData: "2026-11-20" },
    });
    const travada = precoDaOpcao(new Map([["a", preco({ criterioValor: "media30", tendenciaEur: 9 })]]), "a");
    expect(travada).toMatchObject({ cardmarket: { criterioValor: "media30", tendenciaEur: 9 } });
  });
});

describe("ofertarOpcoesDaVarredura", () => {
  const opcao = (chave: string, numero: string, nome = "Monstrinho") => ({
    id: `${chave}-${numero}`,
    chave,
    edicaoId: null,
    edicaoSigla: "XX1",
    nome,
    numero,
    total: "100",
  });

  it("marca pela identidade da escolha, com o número sem zero à esquerda", () => {
    const { oferecidas } = ofertarOpcoesDaVarredura(
      [opcao("1", "001"), opcao("1", "002")],
      [{ chave: "1", identidade: "sigla:XX1/1" }],
      new Set(),
    );
    expect(oferecidas.map((o) => [o.id, o.selecionada, o.semEstoque])).toEqual([
      ["1-001", true, false],
      ["1-002", false, false],
    ]);
  });

  it("esconde a sem estoque e conta por vaga, mas nunca a marcada", () => {
    const { oferecidas, escondidasPorVaga } = ofertarOpcoesDaVarredura(
      [opcao("1", "001"), opcao("1", "002"), opcao("2", "002")],
      [{ chave: "1", identidade: "sigla:XX1/1" }],
      new Set(["monstrinho|1/100", "monstrinho|2/100"]),
    );
    expect(oferecidas.map((o) => [o.id, o.selecionada, o.semEstoque])).toEqual([
      ["1-001", true, true],
    ]);
    expect(Object.fromEntries(escondidasPorVaga)).toEqual({ "1": 1, "2": 1 });
  });

  it("a escolha de outra vaga não marca a mesma carta aqui", () => {
    const { oferecidas } = ofertarOpcoesDaVarredura(
      [opcao("1", "001")],
      [{ chave: "9", identidade: "sigla:XX1/1" }],
      new Set(),
    );
    expect(oferecidas[0].selecionada).toBe(false);
  });
});

describe("ofertarCandidatas", () => {
  const vaga = (candidatas: CartaCandidata[], chave = "1") => ({
    chave,
    rotulo: "Monstrinho",
    setNome: null,
    dex: Number(chave),
    candidatas,
  });

  it("marca a candidata pela carta e põe o preço de cada uma", () => {
    const [v] = ofertarCandidatas(
      [vaga([candidata({}), candidata({ cartaId: "xx2-005", numero: "005" })])],
      [escolha({})],
      new Map([["xx2-005", preco({ valor: 3 })]]),
      new Set(),
    );
    expect(v.opcoes.map((o) => [o.id, o.selecionada, o.preco])).toEqual([
      ["1|xx1-001", true, null],
      ["1|xx2-005", false, 3],
    ]);
    expect(v).toMatchObject({ descartadas: 0, semEstoque: 0 });
  });

  it("a escolha que nenhuma candidata explica entra primeiro, marcada, com o id dela", () => {
    const [v] = ofertarCandidatas(
      [vaga([candidata({})])],
      [escolha({ id: "antiga", cartaId: null, nome: "Fora do catálogo", identidade: "edid:1/7" })],
      new Map(),
      new Set(),
    );
    expect(v.opcoes[0]).toMatchObject({
      id: "escolha|antiga",
      escolhaId: "antiga",
      selecionada: true,
      caminho: "/c",
      imagemUrl: null,
    });
    expect(v.opcoes[1]).toMatchObject({ id: "1|xx1-001", selecionada: false });
    expect(v.opcoes[1]).not.toHaveProperty("caminho");
  });

  it("escolha de vaga já preenchida não marca nem aparece", () => {
    const [v] = ofertarCandidatas(
      [vaga([candidata({})])],
      [escolha({ vagaVazia: false }), escolha({ id: "x", cartaId: null, vagaVazia: false })],
      new Map(),
      new Set(),
    );
    expect(v.opcoes.map((o) => [o.id, o.selecionada])).toEqual([["1|xx1-001", false]]);
  });

  it("esconde a sem estoque não marcada e conta; a marcada fica com a marca", () => {
    const [v] = ofertarCandidatas(
      [
        vaga([
          candidata({}),
          candidata({ cartaId: "xx2-005", numero: "005", nome: "Outro" }),
        ]),
      ],
      [escolha({})],
      new Map(),
      new Set(["monstrinho|1/100", "outro|5/100"]),
    );
    expect(v.opcoes.map((o) => [o.id, o.selecionada, o.semEstoque])).toEqual([
      ["1|xx1-001", true, true],
    ]);
    expect(v.semEstoque).toBe(1);
  });

  it("nomeExibicao só vai quando existe", () => {
    const [v] = ofertarCandidatas(
      [vaga([candidata({}), candidata({ cartaId: "b", nomeExibicao: "Monstrinho BR" })])],
      [],
      new Map(),
      new Set(),
    );
    expect(v.opcoes[0]).not.toHaveProperty("nomeExibicao");
    expect(v.opcoes[1]).toMatchObject({ nomeExibicao: "Monstrinho BR" });
  });
});

describe("resumirPrecosDasCandidatas", () => {
  const agora = new Date("2026-11-22T12:00:00Z");
  const horas = (h: number) => new Date(agora.getTime() - h * 3_600_000);

  it("conta com preço, sem preço no Cardmarket e a buscar; o corte de 7 dias é inclusivo", () => {
    const r = resumirPrecosDasCandidatas(
      new Set(["nunca", "fresca", "semPreco", "noLimite", "velha"]),
      new Map([
        ["fresca", { valor: 10, consultadoEm: horas(1) }],
        ["semPreco", { valor: null, consultadoEm: horas(2) }],
        // Exatamente 7 dias: já venceu, uma rodada agora perguntaria de novo.
        ["noLimite", { valor: 3, consultadoEm: horas(7 * 24) }],
        ["velha", { valor: null, consultadoEm: horas(8 * 24) }],
        // Preço de uma escolha que não é candidata: não entra na conta.
        ["fora", { valor: 1, consultadoEm: horas(1) }],
      ]),
      agora,
    );
    expect(r).toEqual({ cartas: 5, comPreco: 2, semPrecoNoCardmarket: 2, aBuscar: 3, validadeDias: 7 });
  });
});
