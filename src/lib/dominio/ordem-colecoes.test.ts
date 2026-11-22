import { describe, expect, it } from "vitest";

import {
  anexarAoFim,
  canonizarIds,
  conferirNovaOrdem,
  idsDaSecao,
  moverNaOrdem,
  ordenarColecoes,
  posicoesQueMudam,
  proximaOrdem,
  secoesDeColecoes,
  soltarDeGruposAusentes,
  type ColecaoOrdenavel,
  type GrupoOrdenavel,
} from "./ordem-colecoes";

/* Tudo inventado aqui. */
const col = (id: string, grupoId: string | null, ordem: number, criadoEm = "2026-11-01T00:00:00Z"): ColecaoOrdenavel => ({
  id,
  grupoId,
  ordem,
  criadoEm,
});
const grp = (id: string, ordem: number, criadoEm = "2026-11-01T00:00:00Z"): GrupoOrdenavel => ({ id, ordem, criadoEm });

describe("ordenarColecoes", () => {
  it("grupos pela ordem deles, coleções pela ordem dentro do grupo, sem grupo por último", () => {
    const grupos = [grp("g2", 1), grp("g1", 0)];
    const colecoes = [
      col("solta-b", null, 1),
      col("g2-a", "g2", 0),
      col("solta-a", null, 0),
      col("g1-b", "g1", 1),
      col("g1-a", "g1", 0),
    ];
    expect(ordenarColecoes(colecoes, grupos).map((c) => c.id)).toEqual([
      "g1-a",
      "g1-b",
      "g2-a",
      "solta-a",
      "solta-b",
    ]);
  });

  it("empate de ordem: a mais nova primeiro (a ordem de antes de existir ordem)", () => {
    const colecoes = [
      col("velha", null, 0, "2026-01-01T00:00:00Z"),
      col("nova", null, 0, "2026-06-01T00:00:00Z"),
    ];
    expect(ordenarColecoes(colecoes, []).map((c) => c.id)).toEqual(["nova", "velha"]);
  });

  it("aceita Date (do banco) e texto ISO (do DTO) com o mesmo resultado", () => {
    const comDate = [
      { ...col("a", null, 0), criadoEm: new Date("2026-01-01T00:00:00Z") },
      { ...col("b", null, 0), criadoEm: new Date("2026-02-01T00:00:00Z") },
    ];
    expect(ordenarColecoes(comDate, []).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("coleção de um grupo que não está na lista cai em sem grupo, nunca some", () => {
    const r = ordenarColecoes([col("orfa", "sumiu", 5), col("solta", null, 0)], []);
    expect(r.map((c) => c.id)).toEqual(["solta", "orfa"]);
  });

  it("sem grupos, é a lista plana pela ordem", () => {
    expect(ordenarColecoes([col("b", null, 1), col("a", null, 0)], []).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("secoesDeColecoes", () => {
  it("grupo vazio aparece; sem grupo só aparece com coleção", () => {
    const secoes = secoesDeColecoes([col("a", "g1", 0)], [grp("g1", 0), grp("vazio", 1)]);
    expect(secoes.map((s) => [s.grupo?.id ?? null, s.colecoes.map((c) => c.id)])).toEqual([
      ["g1", ["a"]],
      ["vazio", []],
    ]);
  });

  it("sem grupo vem por último quando tem coleção", () => {
    const secoes = secoesDeColecoes([col("s", null, 0), col("a", "g1", 0)], [grp("g1", 0)]);
    expect(secoes.map((s) => s.grupo?.id ?? null)).toEqual(["g1", null]);
  });
});

describe("idsDaSecao e proximaOrdem", () => {
  it("lista só a seção pedida, em ordem", () => {
    const colecoes = [col("b", "g", 3), col("x", null, 0), col("a", "g", 1)];
    expect(idsDaSecao(colecoes, "g")).toEqual(["a", "b"]);
    expect(idsDaSecao(colecoes, null)).toEqual(["x"]);
  });

  it("o fim de uma seção é uma depois da maior; seção vazia começa em 0", () => {
    expect(proximaOrdem([])).toBe(0);
    expect(proximaOrdem([0, 4, 2])).toBe(5);
  });

  it("anexarAoFim numera a partir do fim, na ordem dada", () => {
    expect(anexarAoFim(["x", "y"], [0, 1])).toEqual([
      { id: "x", ordem: 2 },
      { id: "y", ordem: 3 },
    ]);
    expect(anexarAoFim(["x"], [])).toEqual([{ id: "x", ordem: 0 }]);
  });
});

describe("conferirNovaOrdem", () => {
  const atuais = ["a", "b", "c"];

  it("aceita exatamente o conjunto atual, em qualquer ordem", () => {
    expect(conferirNovaOrdem(atuais, ["c", "a", "b"])).toEqual({ ok: true, ids: ["c", "a", "b"] });
  });

  it("lista velha (faltando, sobrando ou trocada) é desatualizada — 409, nunca aplicada pela metade", () => {
    expect(conferirNovaOrdem(atuais, ["a", "b"])).toEqual({ ok: false, motivo: "desatualizada" });
    expect(conferirNovaOrdem(atuais, ["a", "b", "c", "d"])).toEqual({ ok: false, motivo: "desatualizada" });
    expect(conferirNovaOrdem(atuais, ["a", "b", "d"])).toEqual({ ok: false, motivo: "desatualizada" });
  });

  it("repetição ou tipo errado é corpo malformado", () => {
    expect(conferirNovaOrdem(atuais, ["a", "a", "b"])).toEqual({ ok: false, motivo: "formato" });
    expect(conferirNovaOrdem(atuais, "a,b,c")).toEqual({ ok: false, motivo: "formato" });
    expect(conferirNovaOrdem(atuais, [1, 2, 3])).toEqual({ ok: false, motivo: "formato" });
  });

  it("seção vazia aceita a lista vazia", () => {
    expect(conferirNovaOrdem([], [])).toEqual({ ok: true, ids: [] });
  });
});

describe("posicoesQueMudam", () => {
  it("renumera 0..n-1 e devolve só quem muda", () => {
    const atual = new Map([
      ["a", 0],
      ["b", 5],
      ["c", 2],
    ]);
    expect(posicoesQueMudam(["a", "c", "b"], atual)).toEqual([
      { id: "c", ordem: 1 },
      { id: "b", ordem: 2 },
    ]);
  });

  it("ordem já numerada não gera escrita", () => {
    expect(posicoesQueMudam(["a", "b"], new Map([["a", 0], ["b", 1]]))).toEqual([]);
  });
});

describe("moverNaOrdem", () => {
  it("sobe e desce uma posição; na borda nada muda", () => {
    expect(moverNaOrdem(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverNaOrdem(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moverNaOrdem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

describe("soltarDeGruposAusentes", () => {
  it("coleção de grupo que não veio na lista fica sem grupo — no id também, para a tela não a perder", () => {
    const r = soltarDeGruposAusentes([col("orfa", "sumiu", 3), col("ok", "g", 0), col("solta", null, 1)], [grp("g", 0)]);
    expect(r.map((c) => [c.id, c.grupoId])).toEqual([
      ["orfa", null],
      ["ok", "g"],
      ["solta", null],
    ]);
  });
});

describe("canonizarIds", () => {
  it("UUID em maiúsculas vira a forma do banco, e a lista confere", () => {
    const atuais = ["0b9f6c1e-2d3a-4c5b-8e7f-1a2b3c4d5e6f"];
    const pedida = canonizarIds(["0B9F6C1E-2D3A-4C5B-8E7F-1A2B3C4D5E6F"]);
    expect(conferirNovaOrdem(atuais, pedida)).toEqual({ ok: true, ids: atuais });
  });

  it("o que não é lista de textos passa como veio, para a conferência recusar o formato", () => {
    expect(canonizarIds("x")).toBe("x");
    expect(conferirNovaOrdem(["a"], canonizarIds([1]))).toEqual({ ok: false, motivo: "formato" });
  });
});
