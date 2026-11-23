import { describe, expect, it } from "vitest";

import type { EscolhaDaVagaFaltaV2DTO, OpcaoFaltaV2DTO, VagaFaltaV2DTO } from "@/lib/dominio/tipos-cliente";

import {
  MAXIMO_POR_PEDIDO,
  type Pendencia,
  acaoDoArrasto,
  acaoDoToque,
  comPendencia,
  corpoDoAlvo,
  desfechoDaSelecao,
  juntarCorpos,
  naListaDaVaga,
  planoDoAtalho,
  podarPendencias,
  resumoComPendencias,
  type VagaDoToque,
} from "./compra-falta";

/* Dados inventados, no formato da leitura `GET /api/colecoes/:id/falta`. */

function opcao(parcial: Partial<OpcaoFaltaV2DTO> & Pick<OpcaoFaltaV2DTO, "alvo">): OpcaoFaltaV2DTO {
  return {
    id: "op-1",
    cartaId: "xx-001",
    nome: "Carta Inventada",
    edicaoNome: "Edição Inventada",
    numero: "001",
    total: "100",
    raridade: "Common",
    selecionada: false,
    semEstoque: false,
    preco: { fonte: "cardmarket", valor: 2.5, em: "2026-11-20T12:00:00.000Z" },
    ...parcial,
  };
}

function escolha(parcial: Partial<EscolhaDaVagaFaltaV2DTO> = {}): EscolhaDaVagaFaltaV2DTO {
  return {
    escolhaId: "esc-1",
    cartaId: "xx-001",
    nome: "Carta Inventada",
    edicaoNome: "Edição Inventada",
    numero: "001",
    total: "100",
    raridade: "Common",
    preco: { fonte: "cardmarket", valor: 2.5, em: null },
    ...parcial,
  };
}

function vaga(parcial: Partial<VagaFaltaV2DTO> = {}): VagaFaltaV2DTO {
  return {
    vagaId: "v-1",
    chave: "xx/001",
    numero: "001",
    rotulo: "Carta Inventada",
    dex: null,
    setNome: "Edição Inventada",
    livres: 0,
    opcoes: 1,
    descartadas: 0,
    semEstoque: 0,
    proposta: null,
    escolhas: [],
    ...parcial,
  };
}

const candidata = opcao({ alvo: { tipo: "candidata", chave: "xx/001", cartaId: "xx-001" } });
const daLiga = opcao({ id: "liga-9", alvo: { tipo: "opcaoLiga", id: "liga-9" }, preco: { fonte: "liga", valor: 4, em: null } });

function toque(parcial: Partial<VagaDoToque>): VagaDoToque {
  return {
    tipo: "set",
    fonte: "cardmarket",
    chave: "xx/001",
    livres: 0,
    cartaDaVaga: "xx-001",
    falta: vaga({ proposta: candidata }),
    pendente: undefined,
    ...parcial,
  };
}

describe("corpos de PATCH .../selecao (os mesmos da v1)", () => {
  it("cada alvo vira o corpo da rota", () => {
    expect(corpoDoAlvo({ tipo: "candidata", chave: "xx/001", cartaId: "xx-001" }, true)).toEqual({
      cartas: [{ chave: "xx/001", cartaId: "xx-001" }],
      selecionada: true,
    });
    expect(corpoDoAlvo({ tipo: "opcaoLiga", id: "liga-9" }, false)).toEqual({ ids: ["liga-9"], selecionada: false });
    expect(corpoDoAlvo({ tipo: "escolha", escolhaId: "esc-1" }, false)).toEqual({ ids: ["esc-1"], selecionada: false });
  });

  it("a escolha avulsa só se desmarca", () => {
    expect(corpoDoAlvo({ tipo: "escolha", escolhaId: "esc-1" }, true)).toBeNull();
  });

  it("juntar faz um pedido por forma e sentido, sem repetir, desmarcando primeiro", () => {
    const juntos = juntarCorpos([
      { cartas: [{ chave: "a", cartaId: "1" }], selecionada: true },
      { ids: ["e1"], selecionada: false },
      { cartas: [{ chave: "a", cartaId: "1" }], selecionada: true },
      { cartas: [{ chave: "b", cartaId: "2" }], selecionada: true },
      { ids: ["e2"], selecionada: false },
    ]);
    expect(juntos).toEqual([
      { ids: ["e1", "e2"], selecionada: false },
      { cartas: [{ chave: "a", cartaId: "1" }, { chave: "b", cartaId: "2" }], selecionada: true },
    ]);
  });

  it("fatia no teto da rota", () => {
    const muitos = Array.from({ length: MAXIMO_POR_PEDIDO + 5 }, (_, i) => ({ ids: [`id-${i}`], selecionada: true }));
    const juntos = juntarCorpos(muitos);
    expect(juntos).toHaveLength(2);
    expect("ids" in juntos[0] && juntos[0].ids.length).toBe(MAXIMO_POR_PEDIDO);
  });
});

describe("o toque (decisão 2)", () => {
  it("antes da leitura chegar, espera", () => {
    expect(acaoDoToque(toque({ falta: undefined })).tipo).toBe("esperar");
  });

  it("vaga com cópia livre abre o detalhe (alocar é o que a preenche)", () => {
    expect(acaoDoToque(toque({ livres: 1 })).tipo).toBe("abrirDetalhe");
  });

  it("na Pokédex o toque abre as opções, nunca marca", () => {
    const a = acaoDoToque(toque({ tipo: "pokedex", cartaDaVaga: null, falta: vaga({ proposta: candidata, opcoes: 12 }) }));
    expect(a.tipo).toBe("abrirOpcoes");
  });

  it("no set marca a proposta, e o desfazer é desmarcar a mesma carta", () => {
    const a = acaoDoToque(toque({}));
    expect(a).toEqual({
      tipo: "marcar",
      corpo: { cartas: [{ chave: "xx/001", cartaId: "xx-001" }], selecionada: true },
      desfazer: { cartas: [{ chave: "xx/001", cartaId: "xx-001" }], selecionada: false },
      preco: 2.5,
    });
  });

  it("na Liga marca a opção da varredura salva pelo id", () => {
    const a = acaoDoToque(toque({ fonte: "liga", falta: vaga({ proposta: daLiga }) }));
    expect(a).toMatchObject({ tipo: "marcar", corpo: { ids: ["liga-9"], selecionada: true }, preco: 4 });
  });

  it("sem preço no Cardmarket, o toque é a escolha manual da carta da vaga", () => {
    const a = acaoDoToque(toque({ falta: vaga({ proposta: null, semProposta: "semPreco", opcoes: 1 }) }));
    expect(a).toMatchObject({ tipo: "marcar", corpo: { cartas: [{ chave: "xx/001", cartaId: "xx-001" }] }, preco: null });
  });

  it("nada oferecido (teto, sem estoque, fora do catálogo, Liga sem varredura) abre as opções", () => {
    expect(acaoDoToque(toque({ falta: vaga({ opcoes: 0, semProposta: "semOpcao", semEstoque: 1 }) })).tipo).toBe("abrirOpcoes");
    expect(acaoDoToque(toque({ fonte: "liga", falta: vaga({ opcoes: 0, semProposta: "semOpcao" }) })).tipo).toBe("abrirOpcoes");
  });

  it("uma escolha na vaga: o toque a tira pelo id da escolha", () => {
    const a = acaoDoToque(toque({ falta: vaga({ escolhas: [escolha()], semProposta: "jaTemEscolha" }) }));
    expect(a).toEqual({
      tipo: "desmarcar",
      corpo: { ids: ["esc-1"], selecionada: false },
      desfazer: { cartas: [{ chave: "xx/001", cartaId: "xx-001" }], selecionada: true },
      preco: 2.5,
    });
  });

  it("na Liga a escolha tirada não tem como voltar sem reler: o segundo toque espera", () => {
    const a = acaoDoToque(toque({ fonte: "liga", falta: vaga({ escolhas: [escolha({ preco: null })] }) }));
    expect(a).toMatchObject({ tipo: "desmarcar", desfazer: null });
    if (a.tipo !== "desmarcar") throw new Error("esperado desmarcar");
    const pendente: Pendencia = { seq: 1, selecionada: false, corpo: a.corpo, desfazer: a.desfazer, preco: null, antes: true };
    expect(acaoDoToque(toque({ fonte: "liga", pendente })).tipo).toBe("esperar");
  });

  it("duas ou mais escolhas: o toque nunca limpa a vaga, abre as opções", () => {
    const a = acaoDoToque(toque({ falta: vaga({ escolhas: [escolha(), escolha({ escolhaId: "esc-2" })] }) }));
    expect(a.tipo).toBe("abrirOpcoes");
  });

  it("tocar de novo antes de reler desfaz o primeiro toque", () => {
    const primeiro = acaoDoToque(toque({}));
    if (primeiro.tipo !== "marcar") throw new Error("esperado marcar");
    const pendente: Pendencia = { seq: 1, selecionada: true, corpo: primeiro.corpo, desfazer: primeiro.desfazer, preco: 2.5, antes: false };
    const segundo = acaoDoToque(toque({ pendente }));
    expect(segundo).toEqual({ tipo: "desmarcar", corpo: primeiro.desfazer, desfazer: primeiro.corpo, preco: 2.5 });
  });

  it("o arrasto aplica um sentido só", () => {
    const marcar = acaoDoToque(toque({}));
    const desmarcar = acaoDoToque(toque({ falta: vaga({ escolhas: [escolha()] }) }));
    expect(acaoDoArrasto(true, marcar)).toBe(marcar);
    expect(acaoDoArrasto(true, desmarcar)).toBeNull();
    expect(acaoDoArrasto(false, desmarcar)).toBe(desmarcar);
    expect(acaoDoArrasto(true, { tipo: "abrirOpcoes" })).toBeNull();
  });
});

describe("pendências otimistas", () => {
  const p = (seq: number, selecionada: boolean, preco: number | null = null): Omit<Pendencia, "antes"> => ({
    seq,
    selecionada,
    corpo: { ids: ["x"], selecionada },
    desfazer: null,
    preco,
  });

  it("a pendência vence a leitura, e sem leitura da falta valem as escolhas da grade", () => {
    expect(naListaDaVaga(vaga(), 0, undefined)).toBe(false);
    expect(naListaDaVaga(vaga({ escolhas: [escolha()] }), 0, undefined)).toBe(true);
    expect(naListaDaVaga(undefined, 2, undefined)).toBe(true);
    expect(naListaDaVaga(vaga({ escolhas: [escolha()] }), 1, { ...p(1, false), antes: true })).toBe(false);
  });

  it("trocar a pendência guarda o estado da leitura, não o da tela", () => {
    let m = comPendencia(new Map(), "v-1", p(1, true), false);
    m = comPendencia(m, "v-1", p(2, false), true);
    expect(m.get("v-1")).toMatchObject({ seq: 2, selecionada: false, antes: false });
  });

  it("uma leitura só tira as pendências dos pedidos que terminaram antes de ela sair", () => {
    let m = comPendencia(new Map(), "v-1", p(1, true), false);
    m = comPendencia(m, "v-2", p(2, true), false);
    expect([...podarPendencias(m, 1).keys()]).toEqual(["v-2"]);
    expect(podarPendencias(m, 2).size).toBe(0);
  });

  it("o resumo soma só o que muda em relação à leitura, em centavos", () => {
    let m = comPendencia(new Map(), "v-1", p(1, true, 0.1), false);
    m = comPendencia(m, "v-2", p(2, true, 0.2), false);
    m = comPendencia(m, "v-3", p(3, false, 1.5), true);
    // Marcar e desmarcar a mesma vaga antes de reler não muda nada.
    m = comPendencia(m, "v-4", p(4, true, 9), false);
    m = comPendencia(m, "v-4", p(5, false, 9), false);
    expect(resumoComPendencias({ selecionadas: 3, total: 10 }, m)).toEqual({ cartas: 4, total: 8.8, pendentes: 4 });
  });
});

describe("marcar a melhor de cada vaga", () => {
  it("leva a proposta de cada vaga sem escolha e diz por que as outras ficam fora", () => {
    const vagas = [
      vaga({ vagaId: "a", chave: "xx/001", proposta: candidata }),
      vaga({ vagaId: "b", chave: "xx/002", proposta: null, semProposta: "jaTemEscolha", escolhas: [escolha()] }),
      vaga({ vagaId: "c", chave: "xx/003", proposta: null, semProposta: "semPreco" }),
      vaga({ vagaId: "d", chave: "xx/004", proposta: null, semProposta: "semOpcao", opcoes: 0 }),
      vaga({ vagaId: "e", chave: "xx/005", proposta: opcao({ alvo: { tipo: "candidata", chave: "xx/005", cartaId: "xx-005" } }) }),
    ];
    const pendencias = comPendencia(new Map(), "e", { seq: 1, selecionada: true, corpo: { ids: [], selecionada: true }, desfazer: null, preco: null }, false);
    const plano = planoDoAtalho(vagas, pendencias);
    expect(plano.itens.map((i) => i.vagaId)).toEqual(["a"]);
    expect(plano.fora).toEqual({ jaTemEscolha: 1, semPreco: 1, semOpcao: 1, pendentes: 1 });
    expect(plano.corpos).toEqual([{ cartas: [{ chave: "xx/001", cartaId: "xx-001" }], selecionada: true }]);
  });

  it("na Liga um pedido só, pelos ids das opções", () => {
    const vagas = [vaga({ vagaId: "a", proposta: daLiga }), vaga({ vagaId: "b", proposta: { ...daLiga, id: "liga-10", alvo: { tipo: "opcaoLiga", id: "liga-10" } } })];
    expect(planoDoAtalho(vagas, new Map()).corpos).toEqual([{ ids: ["liga-9", "liga-10"], selecionada: true }]);
  });
});

describe("a resposta da rota", () => {
  it("lê o status e o que mudou", () => {
    expect(desfechoDaSelecao(200, 3, 3)).toEqual({ tipo: "ok" });
    expect(desfechoDaSelecao(200, 4, 3)).toEqual({ tipo: "ok" });
    expect(desfechoDaSelecao(200, 0, 1)).toEqual({ tipo: "parcial" });
    expect(desfechoDaSelecao(404, null, 1)).toEqual({ tipo: "recusada", motivo: "colecao" });
    expect(desfechoDaSelecao(400, null, 1)).toEqual({ tipo: "recusada", motivo: "pedido" });
    expect(desfechoDaSelecao(500, null, 1)).toEqual({ tipo: "recusada", motivo: "servidor" });
    expect(desfechoDaSelecao(200, null, 1)).toEqual({ tipo: "recusada", motivo: "servidor" });
  });
});
