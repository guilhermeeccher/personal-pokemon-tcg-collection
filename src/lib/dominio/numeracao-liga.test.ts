import { describe, expect, it } from "vitest";

import { identidadeNaLiga, setIdsDaSiglaLiga } from "./numeracao-liga";

const classica = (localId: string) => ({
  setId: "30th-c",
  localId,
  setSigla: "30C",
  setQtdOficial: 0,
});

describe("identidadeNaLiga", () => {
  it("devolve o que o catálogo grava para um set sem exceção", () => {
    expect(
      identidadeNaLiga({ setId: "me02", localId: "010", setSigla: "PFL", setQtdOficial: 130 }),
    ).toEqual({ sigla: "PFL", numero: "010", total: 130 });
  });

  it("preserva sigla e total nulos de um set sem esses dados", () => {
    expect(
      identidadeNaLiga({ setId: "x", localId: "1", setSigla: null, setQtdOficial: null }),
    ).toEqual({ sigla: null, numero: "1", total: null });
  });

  it("não mexe no set principal da 30 Anos, que divide a sigla 30C", () => {
    expect(
      identidadeNaLiga({ setId: "30th", localId: "005", setSigla: "30C", setQtdOficial: 128 }),
    ).toEqual({ sigla: "30C", numero: "005", total: 128 });
  });

  it("usa a sigla 30C-C, o total 30 e o número original nas clássicas", () => {
    expect(identidadeNaLiga(classica("001"))).toEqual({ sigla: "30C-C", numero: "004", total: 30 });
    // Delcatty: 005/30 medido na Liga em 2026-10-05.
    expect(identidadeNaLiga(classica("002"))).toEqual({ sigla: "30C-C", numero: "005", total: 30 });
    expect(identidadeNaLiga(classica("029")).numero).toBe("149");
    expect(identidadeNaLiga(classica("030")).numero).toBe("203");
  });

  it("a Misty clássica não responde mais ao número 005 da sigla 30C", () => {
    const misty = identidadeNaLiga(classica("005"));
    expect(misty).toEqual({ sigla: "30C-C", numero: "018", total: 30 });
    const principal = identidadeNaLiga({
      setId: "30th",
      localId: "005",
      setSigla: "30C",
      setQtdOficial: 128,
    });
    expect(`${misty.sigla}:${misty.numero}`).not.toBe(`${principal.sigla}:${principal.numero}`);
  });

  it("mantém os números repetidos que a Liga distingue pelo nome", () => {
    expect(identidadeNaLiga(classica("003")).numero).toBe("011");
    expect(identidadeNaLiga(classica("004")).numero).toBe("011");
    expect(
      ["022", "023", "024"].map((l) => identidadeNaLiga(classica(l)).numero),
    ).toEqual(["106", "106", "106"]);
    expect(identidadeNaLiga(classica("019")).numero).toBe("099");
    expect(identidadeNaLiga(classica("020")).numero).toBe("100");
  });

  it("cobre as 30 cartas do set", () => {
    for (let i = 1; i <= 30; i += 1) {
      const id = identidadeNaLiga(classica(String(i).padStart(3, "0")));
      expect(id.sigla).toBe("30C-C");
      expect(id.numero).toMatch(/^\d{3}$/);
    }
  });

  it("carta fora da tabela do set excepcional cai no padrão do catálogo", () => {
    expect(identidadeNaLiga(classica("031"))).toEqual({
      sigla: "30C",
      numero: "031",
      total: 0,
    });
  });
});

describe("setIdsDaSiglaLiga", () => {
  it("aponta 30C-C para o set das clássicas, sem caixa", () => {
    expect(setIdsDaSiglaLiga("30c-c")).toEqual(["30th-c"]);
  });

  it("não inventa set para sigla comum", () => {
    expect(setIdsDaSiglaLiga("30C")).toEqual([]);
    expect(setIdsDaSiglaLiga("PFL")).toEqual([]);
  });
});
