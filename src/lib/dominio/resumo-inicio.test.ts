import { describe, expect, it } from "vitest";

import { naoTransferiveis } from "./dex-disponibilidade";
import { mapearEstadosDex, progressoDex } from "./dex-estado";
import { oportunidadesHome } from "./dex-inventario";
import { montarRecebidos } from "./dex-recebidos";
import { resolverSecoes } from "./dex-secoes";
import type { RegraTrofeuHome } from "./dex-trofeus";
import { comTrofeusDoHome, proximoTrofeuHome } from "./dex-trofeus-home";
import { estanteDeTrofeus } from "./dex-visao-geral";
import { selecionarQuaseLa, type Divisao } from "./divisoes-colecao";
import { colecoesNoInicio, planosNoInicio, resumoDexInicio, type EntradaResumoDexInicio } from "./resumo-inicio";
import type { ColecaoInicioDTO, PlanoDexDTO, TarefaDexDTO, TrofeuDexDTO } from "./tipos-cliente";

/* Tudo inventado aqui: vagas, registros, troféus, planos e coleções. */

const todas = resolverSecoes([]);

type Forma = EntradaResumoDexInicio["formas"][number];
const forma = (id: string, numero: number, extra: Partial<Forma> = {}): Forma => ({
  id,
  numero,
  especie: id,
  forma: null,
  categoria: "base",
  shinyObtenivel: true,
  ...extra,
});
const formas: Forma[] = [
  forma("bulbasaur", 1),
  forma("ivysaur", 2),
  forma("charmander", 4),
  forma("squirtle", 7),
  forma("pikachu", 25),
  forma("raichu-alola", 26, { categoria: "regional", forma: "alola" }),
  forma("unown-b", 201, { categoria: "cosmetica", forma: "b" }),
  forma("chikorita", 152, { shinyObtenivel: false }),
  forma("spinda", 327),
];

type Registro = EntradaResumoDexInicio["registros"][number];
let seq = 0;
const reg = (formaId: string, local: string, extra: Partial<Registro> = {}): Registro => ({
  id: `r${++seq}`,
  formaId,
  shiny: false,
  jogoOrigem: local,
  local,
  capturadoEm: null,
  notas: null,
  aGuardar: false,
  ...extra,
});

const trofeu = (
  id: string,
  jogoId: string,
  extra: Partial<TrofeuDexDTO> = {},
): TrofeuDexDTO => ({
  id,
  jogoId,
  tipo: jogoId === "home" ? "calculado" : "marco",
  nivel: "bronze",
  ordem: 1,
  textos: { "pt-BR": { titulo: `pt ${id}`, descricao: id }, en: { titulo: `en ${id}`, descricao: id } },
  requer: [],
  libera: [],
  regra: null,
  obtido: null,
  ...extra,
});
const doHome = (id: string, regra: RegraTrofeuHome, nivel: TrofeuDexDTO["nivel"] = "bronze") =>
  trofeu(id, "home", { regra, nivel });
const conquistado = { em: "2026-10-01", origem: "manual" as const, notas: null };

const tarefa = (id: string, ordem: number, extra: Partial<TarefaDexDTO> = {}): TarefaDexDTO => ({
  id,
  ordem,
  titulo: `Tarefa ${id}`,
  descricao: null,
  tipo: "captura",
  jogoId: null,
  formaIds: [],
  trofeuId: null,
  status: "aberta",
  concluidaEm: null,
  etapas: [],
  ...extra,
});
const plano = (id: string, tarefas: TarefaDexDTO[], extra: Partial<PlanoDexDTO> = {}): PlanoDexDTO => ({
  id,
  titulo: `Plano ${id}`,
  objetivo: null,
  inicio: "2026-10-01",
  fim: null,
  status: "ativo",
  origem: "manual",
  trofeuIds: [],
  tarefas,
  ...extra,
});
const etapa = (id: string, feita: boolean) => ({ id, ordem: 1, texto: id, detalhe: null, feita, feitaEm: null });

describe("planosNoInicio", () => {
  it("só planos ativos, na ordem recebida, com o limite e o que sobra", () => {
    const r = planosNoInicio([
      plano("a", []),
      plano("concluido", [], { status: "concluido" }),
      plano("b", []),
      plano("encerrado", [], { status: "encerrado" }),
      plano("c", []),
    ]);
    expect(r.planos.map((p) => p.id)).toEqual(["a", "b"]);
    // O concluído e o encerrado não contam como "mais planos ativos".
    expect(r.planosAlem).toBe(1);
  });

  it("até 2 tarefas abertas por plano, por ordem, e quantas abertas sobram", () => {
    const r = planosNoInicio([
      plano("a", [
        tarefa("t4", 4),
        tarefa("t1", 1, { status: "feita" }),
        tarefa("t3", 3),
        tarefa("t2", 2),
        tarefa("t5", 5),
        tarefa("t6", 6, { status: "descartada" }),
      ]),
    ]);
    expect(r.planos[0].tarefas.map((x) => x.id)).toEqual(["t2", "t3"]);
    expect(r.planos[0].abertasAlem).toBe(2);
  });

  it("o progresso conta a descartada como não aberta, como a /dex", () => {
    const r = planosNoInicio([
      plano("a", [tarefa("t1", 1, { status: "feita" }), tarefa("t2", 2, { status: "descartada" }), tarefa("t3", 3)]),
    ]);
    expect(r.planos[0]).toMatchObject({ feitas: 2, total: 3, abertasAlem: 0 });
  });

  it("etapas feitas/total por tarefa; tarefa sem etapas fica 0/0; o jogo vai pelo nome", () => {
    const r = planosNoInicio([
      plano("a", [
        tarefa("t1", 1, { jogoId: "scarlet", etapas: [etapa("e1", true), etapa("e2", false), etapa("e3", true)] }),
        tarefa("t2", 2, { jogoId: "home" }),
      ]),
    ]);
    expect(r.planos[0].tarefas).toEqual([
      { id: "t1", titulo: "Tarefa t1", jogoNome: "Pokémon Scarlet", etapasFeitas: 2, etapasTotal: 3 },
      { id: "t2", titulo: "Tarefa t2", jogoNome: "Pokémon HOME", etapasFeitas: 0, etapasTotal: 0 },
    ]);
    expect(planosNoInicio([plano("b", [tarefa("t", 1)])]).planos[0].tarefas[0].jogoNome).toBeNull();
  });

  it("limites pedidos e plano sem tarefa", () => {
    const r = planosNoInicio([plano("a", []), plano("b", [tarefa("t1", 1), tarefa("t2", 2)])], { planos: 1, tarefas: 1 });
    expect(r.planos).toHaveLength(1);
    expect(r.planos[0]).toMatchObject({ feitas: 0, total: 0, tarefas: [], abertasAlem: 0 });
    expect(r.planosAlem).toBe(1);
  });
});

describe("resumoDexInicio", () => {
  const registros: Registro[] = [
    reg("bulbasaur", "home", { aGuardar: true }),
    reg("ivysaur", "home"),
    reg("unown-b", "home"),
    reg("pikachu", "home", { shiny: true, aGuardar: true }),
    // Em jogos, ainda não no HOME: dois grupos de "levar ao HOME".
    reg("charmander", "firered"),
    reg("squirtle", "firered"),
    reg("squirtle", "firered", { shiny: true }),
    reg("raichu-alola", "scarlet"),
    // Já no HOME: o do jogo não é oportunidade.
    reg("ivysaur", "scarlet"),
    // O HOME não recebe Spinda do BDSP: nunca é oportunidade.
    reg("spinda", "brilliant-diamond"),
  ];
  const trofeus: TrofeuDexDTO[] = [
    doHome("home-3", { tipo: "quantidade", quantidade: 3, trilha: "normal" }),
    doHome("home-5", { tipo: "quantidade", quantidade: 5, trilha: "normal" }, "prata"),
    doHome("home-cosmeticas", { tipo: "vista", vista: "cosmeticas", trilha: "normal" }, "ouro"),
    trofeu("fr-1", "firered", { obtido: conquistado }),
    trofeu("fr-2", "firered", { nivel: "prata" }),
    trofeu("sc-1", "scarlet", { nivel: "ouro", obtido: conquistado }),
    // De um jogo que ele não marcou: fica de fora.
    trofeu("sw-1", "sword", { obtido: conquistado }),
  ];
  const entrada: EntradaResumoDexInicio = {
    formas,
    secoes: todas,
    registros,
    jogos: [{ jogoId: "firered" }, { jogoId: "scarlet" }, { jogoId: "brilliant-diamond" }],
    trofeus,
    planos: [plano("p", [tarefa("t1", 1)])],
    idioma: "pt-BR",
  };

  it("os números batem com as funções de domínio chamadas direto", () => {
    const r = resumoDexInicio(entrada);
    const mapa = mapearEstadosDex(registros);

    const progresso = progressoDex(formas.filter((f) => f.categoria !== "cosmetica"), mapa, todas);
    expect(r.progresso).toEqual({
      normal: { noHome: progresso.normal.noHome, contam: progresso.normal.contam },
      shiny: { noHome: progresso.shiny.noHome, contam: progresso.shiny.contam },
    });
    // A vista principal: o Unown B (cosmético) não conta; o Chikorita não tem shiny.
    expect(r.progresso).toEqual({ normal: { noHome: 2, contam: 8 }, shiny: { noHome: 1, contam: 7 } });

    const recebidos = montarRecebidos(
      formas.map((f) => ({ ...f, lancamento: 1, ordem: f.numero })),
      registros,
      todas,
      0,
    );
    expect(r.recebidos).toBe(recebidos.ids.length);
    expect(r.recebidos).toBe(2);

    const grupos = oportunidadesHome(registros, naoTransferiveis());
    expect(grupos.length).toBeGreaterThan(1);
    expect(r.levarAoHome).toBe(grupos.reduce((s, g) => s + g.itens.length, 0));
    // Vagas, não grupos: Charmander, Squirtle e Squirtle shiny no FireRed, Raichu de Alola no Scarlet.
    expect(r.levarAoHome).toBe(4);

    const meus = comTrofeusDoHome(
      trofeus.filter((x) => ["home", "firered", "scarlet", "brilliant-diamond"].includes(x.jogoId)),
      formas,
      mapa,
      todas,
    );
    expect(r.estante).toEqual(estanteDeTrofeus(meus));
    // home-3 (bronze) e home-cosmeticas (ouro) calculados; fr-1 (bronze) e sc-1 (ouro) marcados; Scarlet platina.
    expect(r.estante).toEqual({ platina: 1, ouro: 2, prata: 0, bronze: 2 });

    const proximo = proximoTrofeuHome(meus.filter((x) => x.jogoId === "home"), formas, mapa, todas)!;
    expect(r.proximoTrofeu).toEqual({
      titulo: proximo.trofeu.textos["pt-BR"].titulo,
      nivel: proximo.trofeu.nivel,
      feito: proximo.feito,
      alvo: proximo.alvo,
    });
    expect(r.proximoTrofeu).toEqual({ titulo: "pt home-5", nivel: "prata", feito: 3, alvo: 5 });
    expect(r.todosDoHome).toBe(false);
    expect(r.semJogos).toBe(false);
    expect(r.planos.map((p) => p.id)).toEqual(["p"]);
    expect(r.planosAlem).toBe(0);
  });

  it("troféu de jogo que ele não tem não entra na estante", () => {
    const com = resumoDexInicio({ ...entrada, jogos: [...entrada.jogos, { jogoId: "sword" }] });
    const sem = resumoDexInicio(entrada);
    expect(com.estante.bronze).toBe(sem.estante.bronze + 1);
  });

  it("sem jogo possuído: semJogos, e o troféu do HOME conquistado ainda entra na estante", () => {
    const r = resumoDexInicio({ ...entrada, jogos: [] });
    expect(r.semJogos).toBe(true);
    // Só home-3 e home-cosmeticas: os do FireRed e do Scarlet saem.
    expect(r.estante).toEqual({ platina: 0, ouro: 1, prata: 0, bronze: 1 });
  });

  it("todosDoHome só com troféus do HOME no catálogo e todos conquistados", () => {
    const todosCaem = resumoDexInicio({
      ...entrada,
      trofeus: [doHome("home-1", { tipo: "quantidade", quantidade: 1, trilha: "normal" }), trofeu("fr-2", "firered")],
    });
    expect(todosCaem.todosDoHome).toBe(true);
    expect(todosCaem.proximoTrofeu).toBeNull();
    // Todos do HOME caíram: platina do HOME na estante.
    expect(todosCaem.estante.platina).toBe(1);

    const semHome = resumoDexInicio({ ...entrada, trofeus: [trofeu("fr-2", "firered")] });
    expect(semHome.todosDoHome).toBe(false);
    expect(semHome.proximoTrofeu).toBeNull();
  });

  it("próximo nulo com troféu do HOME não conquistado (alvo 0) não é 'todos conquistados'", () => {
    const r = resumoDexInicio({
      ...entrada,
      trofeus: [
        doHome("home-1", { tipo: "quantidade", quantidade: 1, trilha: "normal" }),
        // Nenhuma vaga de Paldea no catálogo: alvo 0, nunca cai e nunca é o próximo.
        doHome("home-paldea", { tipo: "regiao", regiao: "paldea", trilha: "normal" }),
      ],
    });
    expect(r.proximoTrofeu).toBeNull();
    expect(r.todosDoHome).toBe(false);
  });

  it("catálogo de troféus vazio", () => {
    const r = resumoDexInicio({ ...entrada, trofeus: [] });
    expect(r.estante).toEqual({ platina: 0, ouro: 0, prata: 0, bronze: 0 });
    expect(r.proximoTrofeu).toBeNull();
    expect(r.todosDoHome).toBe(false);
  });

  it("o título do próximo troféu vem no idioma pedido", () => {
    expect(resumoDexInicio({ ...entrada, idioma: "en" }).proximoTrofeu?.titulo).toBe("en home-5");
  });

  it("sem registros: tudo zerado", () => {
    const r = resumoDexInicio({ ...entrada, registros: [], trofeus: [], planos: [] });
    expect(r).toMatchObject({
      progresso: { normal: { noHome: 0, contam: 8 }, shiny: { noHome: 0, contam: 7 } },
      recebidos: 0,
      levarAoHome: 0,
      planos: [],
      planosAlem: 0,
    });
  });
});

describe("colecoesNoInicio", () => {
  const regiao = (id: string, total: number, preenchidas: number): Divisao => ({
    id: `regiao:${id}`,
    tipo: "regiao",
    regiao: "kanto",
    total,
    preenchidas,
  });
  const colecao = (id: string, extra: Partial<ColecaoInicioDTO> = {}) => ({
    id,
    nome: `Coleção ${id}`,
    tipo: "pokedex" as const,
    vagasPreenchidas: 10,
    totalVagas: 100,
    ...extra,
  });

  it("corta no limite e diz quantas sobram, só com os campos da tela", () => {
    const todas = ["a", "b", "c", "d", "e", "f"].map((id) => ({ ...colecao(id), parametro: null, notas: "x" }));
    const r = colecoesNoInicio(todas, 4);
    expect(r.colecoes.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.sobram).toBe(2);
    expect(Object.keys(r.colecoes[0]).sort()).toEqual(["id", "nome", "tipo", "totalVagas", "vagasPreenchidas"]);
    expect(colecoesNoInicio(todas.slice(0, 2), 4)).toMatchObject({ sobram: 0 });
    expect(colecoesNoInicio([], 4)).toEqual({ colecoes: [], sobram: 0 });
  });

  /* Só a premissa do corte: a lista cortada perde a divisão da quinta. Que a
     página de fato passa todas ao Quase lá é provado em `lib/db/inicio.test.ts`. */
  it("cortar antes do Quase lá perderia a divisão da quinta coleção", () => {
    const todas = [
      { ...colecao("a"), divisoes: [regiao("a", 100, 10)] },
      { ...colecao("b"), divisoes: [regiao("b", 100, 20)] },
      { ...colecao("c"), divisoes: [regiao("c", 100, 30)] },
      { ...colecao("d"), divisoes: [regiao("d", 100, 40)] },
      { ...colecao("e"), divisoes: [regiao("e", 100, 95)] },
    ];
    const lista = colecoesNoInicio(todas, 4);
    expect(lista.colecoes.map((c) => c.id)).not.toContain("e");
    expect(selecionarQuaseLa(todas, 3)[0].colecaoId).toBe("e");
    expect(selecionarQuaseLa(todas.slice(0, 4), 3).map((q) => q.colecaoId)).not.toContain("e");
  });
});
