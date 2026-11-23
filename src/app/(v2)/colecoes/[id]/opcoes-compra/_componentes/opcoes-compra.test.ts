import { describe, expect, it } from "vitest";

import {
  type OpcaoDTO,
  type VagaDTO,
  PERIODO_CANDIDATAS_MS,
  agruparVagas,
  chavePendencia,
  comPendencias,
  corpoDaBuscaDePrecos,
  corpoDaMarcacao,
  corpoDaVarredura,
  cortarGrupos,
  estaRecolhida,
  estadoDaPrevia,
  filtrosIniciais,
  lerRecolhidas,
  lerTeto,
  menorPreco,
  periodoDeLeituraMs,
  planoMelhor,
  podarPendencias,
  resumoComPendencias,
  rodadaViva,
  semSeqs,
  vagasDaTela,
  vagasVisiveis,
} from "./opcoes-compra";

/* Dados inventados no próprio teste: nada de coleção real (AGENTS.md). */
function opcao(p: Partial<OpcaoDTO> & { id: string }): OpcaoDTO {
  return {
    chave: "1",
    nome: "Carta",
    edicaoNome: "Edição",
    numero: "1",
    total: "100",
    preco: 10,
    raridade: null,
    cartaId: "x-1",
    selecionada: false,
    semEstoque: false,
    imagemUrl: null,
    imagemOrigem: null,
    ...p,
  };
}

function vaga(chave: string, opcoes: OpcaoDTO[], extra: Partial<VagaDTO> = {}): VagaDTO {
  return { chave, rotulo: `Vaga ${chave}`, dex: null, opcoes, descartadas: 0, semEstoque: 0, ...extra };
}

describe("período de leitura", () => {
  it("Liga: clamp(intervalo × 250 ms, 5 s, 60 s), nunca fixo", () => {
    expect(periodoDeLeituraMs({ fonte: "liga", ritmo: { intervaloSegundos: 360, origem: "robots" } })).toBe(60_000);
    expect(periodoDeLeituraMs({ fonte: "liga", ritmo: { intervaloSegundos: 40, origem: "env" } })).toBe(10_000);
    expect(periodoDeLeituraMs({ fonte: "liga", ritmo: { intervaloSegundos: 3, origem: "env" } })).toBe(5_000);
    // Uma resposta sem `fonte` é a da Liga.
    expect(periodoDeLeituraMs({ ritmo: { intervaloSegundos: 120, origem: "robots" } })).toBe(30_000);
  });

  it("Cardmarket: o período da v1 nesta tela, dentro da faixa da regra", () => {
    const p = periodoDeLeituraMs({ fonte: "cardmarket", ritmo: { intervaloSegundos: 360, origem: "robots" } });
    expect(p).toBe(PERIODO_CANDIDATAS_MS);
    expect(p).toBeGreaterThanOrEqual(5_000);
    expect(p).toBeLessThanOrEqual(60_000);
  });

  it("rodada viva: a varredura ou a busca de preços", () => {
    expect(rodadaViva({ varredura: null, rodada: null })).toBe(false);
    expect(rodadaViva({ varredura: null })).toBe(false);
    expect(rodadaViva({ varredura: { emAndamento: true } as never })).toBe(true);
    expect(rodadaViva({ varredura: null, rodada: { emAndamento: true } as never })).toBe(true);
  });
});

describe("parâmetros", () => {
  it("o set começa sem teto e por preço; a Pokédex com o padrão da varredura", () => {
    expect(filtrosIniciais("set")).toMatchObject({ tetoPreco: null, ordenacao: "preco" });
    expect(filtrosIniciais("pokedex")).toMatchObject({ tetoPreco: 20, ordenacao: "preferencia" });
  });

  it("lê o teto: vazio é sem teto, vírgula vale, zero e texto são inválidos", () => {
    expect(lerTeto("")).toEqual({ valido: true, valor: null });
    expect(lerTeto("  ")).toEqual({ valido: true, valor: null });
    expect(lerTeto("12,5")).toEqual({ valido: true, valor: 12.5 });
    expect(lerTeto("0")).toEqual({ valido: false, valor: null });
    expect(lerTeto("-3")).toEqual({ valido: false, valor: null });
    expect(lerTeto("abc")).toEqual({ valido: false, valor: null });
  });

  it("os corpos do POST são os da v1", () => {
    expect(corpoDaVarredura({ teto: 20, ordenacao: "preferencia", incluirFora: true, reconsultarTudo: false })).toEqual({
      tetoPreco: 20,
      ordenacao: "preferencia",
      incluirForaDoCatalogo: true,
    });
    expect(corpoDaVarredura({ teto: null, ordenacao: "preco", incluirFora: false, reconsultarTudo: true })).toEqual({
      tetoPreco: null,
      ordenacao: "preco",
      incluirForaDoCatalogo: false,
      validadeHoras: 0,
    });
    expect(corpoDaBuscaDePrecos(false)).toEqual({});
    expect(corpoDaBuscaDePrecos(true)).toEqual({ validadeHoras: 0 });
  });
});

describe("corpo da marcação", () => {
  it("Liga: a opção da varredura, nos dois sentidos", () => {
    const o = opcao({ id: "11111111-1111-4111-8111-111111111111" });
    expect(corpoDaMarcacao(o, "liga", true)).toEqual({ ids: [o.id], selecionada: true });
    expect(corpoDaMarcacao(o, "liga", false)).toEqual({ ids: [o.id], selecionada: false });
  });

  it("Cardmarket: a carta presa à vaga; a escolha avulsa só sai, pelo id dela", () => {
    const c = opcao({ id: "25|x-1", chave: "25", cartaId: "x-1" });
    expect(corpoDaMarcacao(c, "cardmarket", true)).toEqual({ cartas: [{ chave: "25", cartaId: "x-1" }], selecionada: true });
    expect(corpoDaMarcacao(c, "cardmarket", false)).toEqual({ cartas: [{ chave: "25", cartaId: "x-1" }], selecionada: false });
    const avulsa = opcao({ id: "escolha|e1", escolhaId: "e1", selecionada: true });
    expect(corpoDaMarcacao(avulsa, "cardmarket", false)).toEqual({ ids: ["e1"], selecionada: false });
    expect(corpoDaMarcacao(avulsa, "cardmarket", true)).toBeNull();
    expect(corpoDaMarcacao(opcao({ id: "z", cartaId: null }), "cardmarket", true)).toBeNull();
  });
});

describe("a grade da tela", () => {
  const vagas = [
    vaga("25", [
      opcao({ id: "a", preco: 30, raridade: "Rare" }),
      opcao({ id: "b", preco: 5, raridade: "Common" }),
      opcao({ id: "c", preco: null }),
      opcao({ id: "d", preco: 50, selecionada: true }),
    ]),
  ];

  it("Cardmarket: o teto esconde só preço conhecido acima dele, a sem preço fica por último, a selecionada nunca some", () => {
    const [v] = vagasDaTela(vagas, { fonte: "cardmarket", tipo: "pokedex", teto: 20, ordenacao: "preco" });
    expect(v.opcoes.map((o) => o.id)).toEqual(["b", "d", "c"]);
    expect(v.descartadas).toBe(1);
  });

  it("Cardmarket no set: sempre por preço, qualquer que seja a ordem escolhida", () => {
    const [v] = vagasDaTela(vagas, { fonte: "cardmarket", tipo: "set", teto: null, ordenacao: "preferencia" });
    expect(v.opcoes.map((o) => o.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("Liga: chega como a varredura deixou", () => {
    const [v] = vagasDaTela(vagas, { fonte: "liga", tipo: "pokedex", teto: 1, ordenacao: "preco" });
    expect(v.opcoes.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("só com opção; no set, por preço com a vaga sem preço no fim", () => {
    const lista = [
      vaga("sv1/003", [opcao({ id: "1", preco: 9 })]),
      vaga("sv1/001", []),
      vaga("sv1/002", [opcao({ id: "2", preco: 2 })]),
      vaga("sv1/004", [opcao({ id: "3", preco: null })]),
    ];
    expect(vagasVisiveis(lista, { soComOpcao: true, ehSet: true, ordemVagas: "numero" }).map((v) => v.chave)).toEqual([
      "sv1/003",
      "sv1/002",
      "sv1/004",
    ]);
    expect(vagasVisiveis(lista, { soComOpcao: false, ehSet: true, ordemVagas: "preco" }).map((v) => v.chave)).toEqual([
      "sv1/002",
      "sv1/003",
      "sv1/001",
      "sv1/004",
    ]);
    expect(menorPreco(lista[3])).toBeNull();
  });

  it("agrupa por região na Pokédex, e por set só quando a coleção junta sets", () => {
    const pokedex = [vaga("1", [], { dex: 1 }), vaga("152", [], { dex: 152 }), vaga("153", [], { dex: 153 }), vaga("9999", [], { dex: null })];
    expect(agruparVagas(pokedex, false).map((g) => [g.regiao, g.vagas.length])).toEqual([
      ["kanto", 1],
      ["johto", 2],
      [null, 1],
    ]);
    const umSet = [vaga("a/1", [], { setNome: "A" }), vaga("a/2", [], { setNome: "A" })];
    expect(agruparVagas(umSet, true)).toHaveLength(1);
    expect(agruparVagas(umSet, true)[0].setNome).toBeNull();
    const doisSets = [vaga("a/1", [], { setNome: "A" }), vaga("b/1", [], { setNome: "B" }), vaga("a/2", [], { setNome: "A" })];
    expect(agruparVagas(doisSets, true).map((g) => [g.setNome, g.vagas.length])).toEqual([
      ["A", 2],
      ["B", 1],
    ]);
  });

  it("uma região que volta depois de outra ganha um grupo de id próprio", () => {
    const ids = agruparVagas([vaga("1", [], { dex: 1 }), vaga("152", [], { dex: 152 }), vaga("2", [], { dex: 2 })], false).map((g) => g.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("corta os grupos nas primeiras vagas, sem grupo vazio", () => {
    const grupos = agruparVagas([vaga("1", [], { dex: 1 }), vaga("2", [], { dex: 2 }), vaga("152", [], { dex: 152 })], false);
    expect(cortarGrupos(grupos, 2).map((g) => g.vagas.length)).toEqual([2]);
    expect(cortarGrupos(grupos, 3).map((g) => g.vagas.length)).toEqual([2, 1]);
    expect(cortarGrupos(grupos, 0)).toEqual([]);
  });
});

describe("recolher", () => {
  it("só a escolha explícita é guardada; sem ela, a vaga com seleção começa recolhida", () => {
    const comMarca = vaga("1", [opcao({ id: "a", selecionada: true })]);
    const semMarca = vaga("2", [opcao({ id: "b" })]);
    expect(estaRecolhida(comMarca, {})).toBe(true);
    expect(estaRecolhida(semMarca, {})).toBe(false);
    expect(estaRecolhida(comMarca, { "1": false })).toBe(false);
  });

  it("um valor guardado estragado vale como nenhuma escolha", () => {
    expect(lerRecolhidas(null)).toEqual({});
    expect(lerRecolhidas("{")).toEqual({});
    expect(lerRecolhidas("[1]")).toEqual({});
    expect(lerRecolhidas('{"1":true,"2":"sim"}')).toEqual({ "1": true });
  });
});

describe("pendências", () => {
  const vagas = [vaga("1", [opcao({ id: "a", preco: 10.1, numero: "1" }), opcao({ id: "b", preco: 0.2, numero: "2", selecionada: true })])];
  const ka = chavePendencia(vagas[0].opcoes[0]);
  const kb = chavePendencia(vagas[0].opcoes[1]);

  it("a chave é a carta na vaga, não o id da linha: outra varredura não a perde", () => {
    const antes = opcao({ id: "liga-1", chave: "25", edicaoSigla: "BS", numero: "58" });
    const depois = { ...antes, id: "liga-2" };
    expect(chavePendencia(antes)).toBe(chavePendencia(depois));
    expect(chavePendencia(antes)).not.toBe(chavePendencia({ ...antes, numero: "59" }));
    expect(chavePendencia(antes)).not.toBe(chavePendencia({ ...antes, chave: "26" }));
    const p = new Map([[chavePendencia(antes), { seq: 1, selecionada: true }]]);
    expect(comPendencias([vaga("25", [depois])], p)[0].opcoes[0].selecionada).toBe(true);
    // A escolha avulsa é a própria escolha.
    expect(chavePendencia(opcao({ id: "escolha|e1", escolhaId: "e1" }))).toContain("e1");
  });

  it("a marca otimista vence a leitura até ser podada", () => {
    const p = new Map([[ka, { seq: 3, selecionada: true }]]);
    expect(comPendencias(vagas, p)[0].opcoes.map((o) => o.selecionada)).toEqual([true, true]);
    expect(podarPendencias(p, 2).size).toBe(1);
    expect(podarPendencias(p, 3).size).toBe(0);
    expect(semSeqs(p, [3]).size).toBe(0);
  });

  it("o resumo conta o que muda em centavos inteiros", () => {
    const dados = { selecionadas: 1, total: 0.2, vagas };
    const p = new Map([
      [ka, { seq: 1, selecionada: true }],
      [kb, { seq: 2, selecionada: false }],
    ]);
    expect(resumoComPendencias(dados, p)).toEqual({ cartas: 1, total: 10.1 });
    // Uma pendência igual ao que a leitura já diz não conta duas vezes.
    expect(resumoComPendencias(dados, new Map([[kb, { seq: 1, selecionada: true }]]))).toEqual({ cartas: 1, total: 0.2 });
    // Uma opção que saiu da leitura (vaga preenchida) não conta.
    expect(resumoComPendencias(dados, new Map([["sumiu", { seq: 1, selecionada: true }]]))).toEqual({ cartas: 1, total: 0.2 });
  });
});

describe("marcar a melhor de cada vaga", () => {
  it("Cardmarket: a primeira da ordem da tela, só com preço, só em vaga sem escolha", () => {
    const vagas = [
      vaga("1", [opcao({ id: "1|a", chave: "1", cartaId: "a", preco: 3 }), opcao({ id: "1|b", chave: "1", cartaId: "b", preco: 1 })]),
      vaga("2", [opcao({ id: "2|c", chave: "2", cartaId: "c", preco: null })]),
      vaga("3", [opcao({ id: "3|d", chave: "3", cartaId: "d", selecionada: true })]),
      vaga("4", []),
      vaga("5", [opcao({ id: "5|e", chave: "5", cartaId: "e" })]),
    ];
    const plano = planoMelhor(vagas, "cardmarket", new Map([[chavePendencia(vagas[4].opcoes[0]), { seq: 1, selecionada: true }]]));
    expect(plano.itens.map((i) => i.opcao.id)).toEqual(["1|a"]);
    expect(plano.fora).toEqual({ jaTemEscolha: 1, semPreco: 1, semOpcao: 1, pendentes: 1 });
    expect(plano.corpos).toEqual([{ cartas: [{ chave: "1", cartaId: "a" }], selecionada: true }]);
  });

  it("Liga: a primeira opção da varredura de cada vaga, num pedido só", () => {
    const vagas = [vaga("1", [opcao({ id: "o1" }), opcao({ id: "o2" })]), vaga("2", [opcao({ id: "o3" })])];
    const plano = planoMelhor(vagas, "liga", new Map());
    expect(plano.corpos).toEqual([{ ids: ["o1", "o3"], selecionada: true }]);
  });
});

describe("prévia do sem estoque", () => {
  it("vale só para o texto conferido e a triagem daquele instante", () => {
    expect(estadoDaPrevia({ texto: "A", versao: 2 }, { texto: "A", versao: 2 })).toBe("vale");
    expect(estadoDaPrevia({ texto: "A", versao: 2 }, { texto: "B", versao: 2 })).toBe("textoMudou");
    expect(estadoDaPrevia({ texto: "A", versao: 2 }, { texto: "A", versao: 3 })).toBe("triagemMudou");
  });
});
