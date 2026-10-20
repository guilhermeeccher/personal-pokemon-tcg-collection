import { describe, expect, it } from "vitest";

import {
  MAX_DETALHE_ETAPA,
  MAX_ETAPAS_POR_TAREFA,
  MAX_TEXTO_ETAPA,
  lerDadosEtapa,
  lerEdicaoEtapa,
  lerListaDeEtapas,
  moverNaOrdem,
  progressoEtapas,
  recusaSeExcede,
  recusaSeFechada,
  todasFeitas,
  validarNovaOrdem,
} from "./dex-etapas";

describe("lerDadosEtapa", () => {
  it("apara o texto e o detalhe; detalhe vazio ou ausente vira null", () => {
    expect(lerDadosEtapa({ texto: "  Ir ao porto  ", detalhe: "  pegar o barco\nna ilha  " })).toEqual({
      texto: "Ir ao porto",
      detalhe: "pegar o barco\nna ilha",
    });
    expect(lerDadosEtapa({ texto: "a", detalhe: "   " })).toEqual({ texto: "a", detalhe: null });
    expect(lerDadosEtapa({ texto: "a" })).toEqual({ texto: "a", detalhe: null });
    expect(lerDadosEtapa({ texto: "a", detalhe: null })).toEqual({ texto: "a", detalhe: null });
  });

  it("texto é obrigatório e tem de caber em 200 caracteres", () => {
    expect(lerDadosEtapa({ texto: "   " })).toEqual(["missing texto"]);
    expect(lerDadosEtapa({})).toEqual(["missing texto"]);
    expect(lerDadosEtapa({ texto: "x".repeat(MAX_TEXTO_ETAPA) })).toMatchObject({ texto: "x".repeat(MAX_TEXTO_ETAPA) });
    // O limite vale depois de aparar: espaço em volta não conta.
    expect(lerDadosEtapa({ texto: ` ${"x".repeat(MAX_TEXTO_ETAPA)} ` })).not.toBeInstanceOf(Array);
    expect(lerDadosEtapa({ texto: "x".repeat(MAX_TEXTO_ETAPA + 1) })).toEqual([`texto longer than ${MAX_TEXTO_ETAPA} characters`]);
  });

  it("detalhe até 2000 caracteres, e só texto", () => {
    expect(lerDadosEtapa({ texto: "a", detalhe: "y".repeat(MAX_DETALHE_ETAPA) })).not.toBeInstanceOf(Array);
    expect(lerDadosEtapa({ texto: "a", detalhe: "y".repeat(MAX_DETALHE_ETAPA + 1) })).toEqual([
      `detalhe longer than ${MAX_DETALHE_ETAPA} characters`,
    ]);
    expect(lerDadosEtapa({ texto: "a", detalhe: 3 })).toEqual(["detalhe must be text"]);
  });

  it("junta os problemas de texto e detalhe; não-objeto é recusado", () => {
    expect(lerDadosEtapa({ texto: "", detalhe: 1 })).toEqual(["missing texto", "detalhe must be text"]);
    expect(lerDadosEtapa("texto")).toEqual(["a step must be an object"]);
    expect(lerDadosEtapa([])).toEqual(["a step must be an object"]);
  });
});

describe("lerListaDeEtapas", () => {
  it("ausente é lista vazia; a ordem é a do lote", () => {
    expect(lerListaDeEtapas(undefined)).toEqual([]);
    expect(lerListaDeEtapas([{ texto: "1" }, { texto: "2", detalhe: "d" }])).toEqual([
      { texto: "1", detalhe: null },
      { texto: "2", detalhe: "d" },
    ]);
  });

  it("os problemas vêm com a posição; não-lista é recusada", () => {
    expect(lerListaDeEtapas([{ texto: "ok" }, { texto: "" }])).toEqual(["etapas[1]: missing texto"]);
    expect(lerListaDeEtapas({ texto: "a" })).toEqual(["etapas must be a list"]);
  });
});

describe("lerEdicaoEtapa", () => {
  it("só os campos que vieram", () => {
    expect(lerEdicaoEtapa({ feita: true })).toEqual({ feita: true });
    expect(lerEdicaoEtapa({ texto: " novo " })).toEqual({ texto: "novo" });
    expect(lerEdicaoEtapa({ detalhe: "" })).toEqual({ detalhe: null });
    expect(lerEdicaoEtapa({ detalhe: null, feita: false })).toEqual({ detalhe: null, feita: false });
  });

  it("recusa edição vazia, texto vazio e feita que não é booleano", () => {
    expect(lerEdicaoEtapa({})).toEqual(["nothing to change: send texto, detalhe or feita"]);
    expect(lerEdicaoEtapa({ texto: " " })).toEqual(["missing texto"]);
    expect(lerEdicaoEtapa({ feita: "sim" })).toEqual(["feita must be true or false"]);
    expect(lerEdicaoEtapa(null)).toEqual(["the body must be an object"]);
  });
});

describe("limites e estado da tarefa", () => {
  it("no máximo 50 etapas por tarefa", () => {
    expect(recusaSeExcede(0, MAX_ETAPAS_POR_TAREFA)).toBeNull();
    expect(recusaSeExcede(MAX_ETAPAS_POR_TAREFA - 1, 1)).toBeNull();
    expect(recusaSeExcede(MAX_ETAPAS_POR_TAREFA, 1)).toEqual({ chave: "dexEtapasDemais", valores: { maximo: "50" } });
    expect(recusaSeExcede(10, 41)).not.toBeNull();
  });

  it("só tarefa aberta em plano ativo aceita mudança nas etapas", () => {
    expect(recusaSeFechada({ status: "aberta" }, { status: "ativo" })).toBeNull();
    expect(recusaSeFechada({ status: "feita" }, { status: "ativo" })).toEqual({ chave: "dexTarefaFechada" });
    expect(recusaSeFechada({ status: "descartada" }, { status: "ativo" })).toEqual({ chave: "dexTarefaFechada" });
    expect(recusaSeFechada({ status: "aberta" }, { status: "concluido" })).toEqual({ chave: "dexTarefaFechada" });
    expect(recusaSeFechada({ status: "aberta" }, { status: "encerrado" })).toEqual({ chave: "dexTarefaFechada" });
  });
});

describe("progresso", () => {
  it("conta feitas sobre o total", () => {
    expect(progressoEtapas([])).toEqual({ feitas: 0, total: 0 });
    expect(progressoEtapas([{ feita: true }, { feita: false }, { feita: true }])).toEqual({ feitas: 2, total: 3 });
  });

  it("todas feitas pede pelo menos uma etapa", () => {
    expect(todasFeitas([])).toBe(false);
    expect(todasFeitas([{ feita: true }, { feita: false }])).toBe(false);
    expect(todasFeitas([{ feita: true }, { feita: true }])).toBe(true);
  });
});

describe("reordenação", () => {
  const atuais = ["a", "b", "c"];

  it("aceita uma permutação exata do conjunto atual", () => {
    expect(validarNovaOrdem(atuais, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    expect(validarNovaOrdem([], [])).toEqual([]);
  });

  it("recusa lista velha, com id a mais, a menos, repetido ou estranho", () => {
    const recusa = { chave: "dexOrdemEtapasInvalida" };
    expect(validarNovaOrdem(atuais, ["a", "b"])).toEqual(recusa);
    expect(validarNovaOrdem(atuais, ["a", "b", "c", "d"])).toEqual(recusa);
    expect(validarNovaOrdem(atuais, ["a", "a", "b"])).toEqual(recusa);
    expect(validarNovaOrdem(atuais, ["a", "b", "x"])).toEqual(recusa);
    expect(validarNovaOrdem(atuais, "a,b,c")).toEqual(recusa);
    expect(validarNovaOrdem(atuais, ["a", "b", 3])).toEqual(recusa);
  });

  it("subir e descer trocam com a vizinha; na borda nada muda", () => {
    expect(moverNaOrdem(atuais, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverNaOrdem(atuais, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moverNaOrdem(atuais, "a", -1)).toEqual(atuais);
    expect(moverNaOrdem(atuais, "c", 1)).toEqual(atuais);
    expect(moverNaOrdem(atuais, "x", 1)).toEqual(atuais);
  });
});
