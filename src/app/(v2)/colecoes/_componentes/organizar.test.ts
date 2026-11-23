import { describe, expect, it } from "vitest";

import { TAMANHO_MAXIMO_NOME_GRUPO } from "@/lib/dominio/grupos-colecao";
import type { SugestaoDTO } from "@/lib/dominio/tipos-cliente";

import {
  chaveDaRecusa,
  colecaoQueJaExiste,
  marcasDeExistentes,
  motivoDaRecusa,
  marcasDeFaltantes,
  nomesDeFaltantes,
  origensDaPrevia,
  pedidoDoGrupo,
  reacaoDaPrevia,
  sugestoesNaTela,
  sugestoesRecolhidas,
} from "./organizar";

const recusa = (chave: string, valores?: Record<string, string>) => ({ recusa: { chave, valores } });

describe("reacaoDaPrevia", () => {
  it("fecha a prévia quando o grupo sumiu ou perdeu a série", () => {
    expect(reacaoDaPrevia(404, recusa("grupoColecaoNaoEncontrado"))).toBe("fechar");
    expect(reacaoDaPrevia(400, recusa("grupoSemSerie"))).toBe("fechar");
  });

  it("relê no 409 de lista velha, numa validação e sem resposta", () => {
    expect(reacaoDaPrevia(409, recusa("ordemDeColecoesDesatualizada"))).toBe("reler");
    expect(reacaoDaPrevia(400, recusa("setJaTemColecao", { set: "x" }))).toBe("reler");
    expect(reacaoDaPrevia(500, null)).toBe("reler");
    expect(reacaoDaPrevia(null, null)).toBe("reler");
  });
});

describe("chaveDaRecusa", () => {
  it("lê a chave e ignora corpo sem recusa", () => {
    expect(chaveDaRecusa(recusa("x"))).toBe("x");
    expect(chaveDaRecusa({ erro: "texto" })).toBeNull();
    expect(chaveDaRecusa(null)).toBeNull();
    expect(chaveDaRecusa({ recusa: { chave: 3 } })).toBeNull();
  });
});

describe("marcasDeFaltantes", () => {
  const set = (setId: string, marcadoPorPadrao: boolean, jaTem = false) => ({
    setId,
    nomeSugerido: `2024 - ${setId}`,
    marcadoPorPadrao,
    colecoesExistentes: jaTem ? [{ id: "c", nome: "C" }] : [],
  });

  it("na primeira leitura usa o padrão do servidor e nunca marca set que já tem coleção", () => {
    const marcas = marcasDeFaltantes([set("a", true), set("promo", false), set("b", true, true)], null, "sv");
    expect([...marcas]).toEqual(["a"]);
  });

  it("na releitura da mesma série mantém as marcas do usuário, menos a do set que ganhou coleção", () => {
    const anteriores = { serieId: "sv", marcados: new Set(["a", "promo", "b"]) };
    const marcas = marcasDeFaltantes([set("a", true), set("promo", false), set("b", true, true)], anteriores, "sv");
    expect([...marcas].sort()).toEqual(["a", "promo"]);
  });

  it("não remarca o que o usuário desmarcou", () => {
    const anteriores = { serieId: "sv", marcados: new Set<string>() };
    expect(marcasDeFaltantes([set("a", true)], anteriores, "sv").size).toBe(0);
  });

  it("na mesma série, set novo na prévia segue o padrão e set que saiu perde a marca", () => {
    const anteriores = { serieId: "sv", marcados: new Set(["a", "saiu"]) };
    const marcas = marcasDeFaltantes([set("a", true), set("novo", true), set("novoPromo", false)], anteriores, "sv");
    // O set novo não estava na leitura anterior: a escolha do usuário sobre ele não existe ainda.
    expect([...marcas].sort()).toEqual(["a"]);
  });

  it("quando a série mudou, volta ao padrão da série nova", () => {
    const anteriores = { serieId: "sv", marcados: new Set(["a"]) };
    const marcas = marcasDeFaltantes([set("x", true), set("y", false)], anteriores, "swsh");
    expect([...marcas]).toEqual(["x"]);
  });
});

describe("nomesDeFaltantes", () => {
  it("guarda o nome digitado e dá o sugerido ao set novo", () => {
    const sets = [
      { setId: "a", nomeSugerido: "2024 - A", marcadoPorPadrao: true, colecoesExistentes: [] },
      { setId: "b", nomeSugerido: "2024 - B", marcadoPorPadrao: true, colecoesExistentes: [] },
    ];
    expect(nomesDeFaltantes(sets, { a: "Meu A", sumiu: "x" })).toEqual({ a: "Meu A", b: "2024 - B" });
  });

  it("um nome apagado de propósito continua vazio, nunca volta ao sugerido", () => {
    const sets = [{ setId: "a", nomeSugerido: "2024 - A", marcadoPorPadrao: true, colecoesExistentes: [] }];
    expect(nomesDeFaltantes(sets, { a: "" })).toEqual({ a: "" });
  });
});

describe("marcasDeExistentes", () => {
  const colecao = (id: string, grupo: string | null) => ({
    id,
    grupoAtual: grupo === null ? null : { id: grupo },
    marcadoPorPadrao: grupo === null,
  });

  it("na primeira leitura marca só as que estão em grupo nenhum", () => {
    expect([...marcasDeExistentes([colecao("a", null), colecao("b", "g2")], null, new Set())]).toEqual(["a"]);
  });

  it("mantém a escolha do usuário onde a coleção sai do mesmo grupo", () => {
    const lista = [colecao("a", null), colecao("b", "g2")];
    const marcas = marcasDeExistentes(lista, origensDaPrevia(lista), new Set(["b"]));
    expect([...marcas]).toEqual(["b"]);
  });

  it("volta ao padrão a coleção que outra aba moveu para um grupo depois da prévia", () => {
    const antes = origensDaPrevia([colecao("a", null)]);
    // O usuário a deixou marcada; outra aba a pôs no grupo g3: tirá-la de lá não foi escolhido.
    const marcas = marcasDeExistentes([colecao("a", "g3")], antes, new Set(["a"]));
    expect(marcas.size).toBe(0);
  });

  it("perde a marca quando a coleção trocou de um grupo para outro", () => {
    const antes = origensDaPrevia([colecao("a", "g2")]);
    expect(marcasDeExistentes([colecao("a", "g3")], antes, new Set(["a"])).size).toBe(0);
  });

  it("quando a coleção saiu do grupo para nenhum, vale o padrão (marcada)", () => {
    const antes = origensDaPrevia([colecao("a", "g2")]);
    expect([...marcasDeExistentes([colecao("a", null)], antes, new Set())]).toEqual(["a"]);
  });

  it("a coleção que saiu da prévia leva a marca junto", () => {
    const antes = origensDaPrevia([colecao("a", null), colecao("b", null)]);
    expect([...marcasDeExistentes([colecao("b", null)], antes, new Set(["a", "b"]))]).toEqual(["b"]);
  });

  it("coleção nova na prévia segue o padrão", () => {
    const antes = origensDaPrevia([colecao("a", null)]);
    const marcas = marcasDeExistentes([colecao("a", null), colecao("novo", null)], antes, new Set());
    expect([...marcas]).toEqual(["novo"]);
  });
});

describe("origensDaPrevia", () => {
  it("leva o grupo de cada coleção, nulo para sem grupo", () => {
    expect([...origensDaPrevia([{ id: "a", grupoAtual: { id: "g" }, marcadoPorPadrao: false }, { id: "b", grupoAtual: null, marcadoPorPadrao: true }])]).toEqual([
      ["a", "g"],
      ["b", null],
    ]);
  });
});

describe("pedidoDoGrupo", () => {
  it("cria com o nome aparado e a série só quando escolhida", () => {
    expect(pedidoDoGrupo(null, "  Escarlate  ", "")).toEqual({ nome: "Escarlate" });
    expect(pedidoDoGrupo(null, "Escarlate", "sv")).toEqual({ nome: "Escarlate", serieId: "sv" });
  });

  it("recusa nome vazio ou longo demais", () => {
    expect(pedidoDoGrupo(null, "   ", "sv")).toBeNull();
    expect(pedidoDoGrupo(null, "x".repeat(TAMANHO_MAXIMO_NOME_GRUPO + 1), "")).toBeNull();
  });

  it("na edição manda só o que mudou, e nada quando nada mudou", () => {
    const original = { nome: "Escarlate", serieId: "sv" };
    expect(pedidoDoGrupo(original, "Escarlate ", "sv")).toBeNull();
    expect(pedidoDoGrupo(original, "Outro", "sv")).toEqual({ nome: "Outro" });
    expect(pedidoDoGrupo(original, "Escarlate", "")).toEqual({ serieId: null });
    expect(pedidoDoGrupo({ nome: "Livre", serieId: null }, "Livre", "swsh")).toEqual({ serieId: "swsh" });
  });

  it("compara a série como gravada, sem normalizar caixa", () => {
    expect(pedidoDoGrupo({ nome: "G", serieId: "sm" }, "G", "SM")).toEqual({ serieId: "SM" });
  });
});

describe("sugestoesNaTela", () => {
  const set = (setId: string): SugestaoDTO => ({
    chave: `set:${setId}`,
    tipo: "set",
    valor: setId,
    setId,
    rotulo: setId,
    quantidade: 6,
    total: 100,
    totalOficial: true,
    nomeSugerido: `2024 - ${setId}`,
  });
  const tema: SugestaoDTO = { chave: "tipo:Fire", tipo: "tipo", valor: "Fire", quantidade: 22 };

  it("tira as dispensadas e os sets que ganharam coleção, sem reordenar", () => {
    const lidas = [set("a"), tema, set("b"), set("c")];
    const tela = sugestoesNaTela(lidas, new Set(["set:c"]), new Set(["a"]));
    expect(tela.map((s) => s.chave)).toEqual(["tipo:Fire", "set:b"]);
  });

  it("um set criado não tira um tema de mesmo valor", () => {
    const especie: SugestaoDTO = { chave: "especie:25", tipo: "especie", valor: "25", quantidade: 5 };
    expect(sugestoesNaTela([especie], new Set(), new Set(["25"]))).toEqual([especie]);
  });
});

describe("sugestoesRecolhidas", () => {
  it("a escolha da visita vence a guardada", () => {
    expect(sugestoesRecolhidas(false, "1", true)).toBe(false);
    expect(sugestoesRecolhidas(true, "0", false)).toBe(true);
  });

  it("a guardada vence a largura", () => {
    expect(sugestoesRecolhidas(null, "0", true)).toBe(false);
    expect(sugestoesRecolhidas(null, "1", false)).toBe(true);
  });

  it("sem escolha nem guardada, recolhida só no celular; valor guardado estranho conta como nenhum", () => {
    expect(sugestoesRecolhidas(null, null, true)).toBe(true);
    expect(sugestoesRecolhidas(null, null, false)).toBe(false);
    expect(sugestoesRecolhidas(null, "x", false)).toBe(false);
  });
});

describe("colecaoQueJaExiste", () => {
  it("lê a coleção apontada pelo 409 do tema", () => {
    expect(colecaoQueJaExiste(recusa("temaJaTemColecao", { colecaoId: "id-1", colecao: "Tema — Fogo" }))).toEqual({
      id: "id-1",
      nome: "Tema — Fogo",
    });
  });

  it("ignora outra recusa ou valores incompletos", () => {
    expect(colecaoQueJaExiste(recusa("grupoColecaoNaoEncontrado"))).toBeNull();
    expect(colecaoQueJaExiste(recusa("temaJaTemColecao"))).toBeNull();
    expect(colecaoQueJaExiste(null)).toBeNull();
  });
});

describe("motivoDaRecusa", () => {
  const tRecusas = Object.assign((chave: string) => `[${chave}]`, { has: (chave: string) => chave !== "desconhecida" });

  it("troca a frase do 409 de lista velha pela da v2, que relê sozinha", () => {
    expect(motivoDaRecusa(recusa("ordemDeColecoesDesatualizada"), tRecusas, "nada aplicado")).toBe("nada aplicado");
  });

  it("traduz as outras recusas e dá vazio sem recusa reconhecível", () => {
    expect(motivoDaRecusa(recusa("setJaTemColecao"), tRecusas, "x")).toBe("[setJaTemColecao]");
    expect(motivoDaRecusa(recusa("desconhecida"), tRecusas, "x")).toBe("");
    expect(motivoDaRecusa(null, tRecusas, "x")).toBe("");
  });
});
