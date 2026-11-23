import { describe, expect, it } from "vitest";

import { REGIOES } from "@/lib/dominio/escopo-pokedex";

import {
  abaDaUrl,
  abasDaColecao,
  faixaDaPagina,
  inicioDaVista,
  inicioDasDivisoes,
  lerGradeFichario,
  lerTamanhoInteiro,
  marcasAposReler,
  paginaDoIndice,
  proximoEscopo,
  sentidoDoGesto,
  totalDePaginas,
  umaLinhaPorCarta,
  vaoDoTamanho,
  vagaDoFoco,
  vagasDaAba,
  gradeEfetiva,
  maiorGradeQueCabe,
  tamanhoEfetivo,
} from "./vista-colecao";

describe("abas", () => {
  it("set e Pokédex têm as quatro; customizada só a lista inteira (decisão 1)", () => {
    expect(abasDaColecao("set")).toEqual(["fichario", "inteiro", "upgrades", "falta"]);
    expect(abasDaColecao("pokedex")).toEqual(["fichario", "inteiro", "upgrades", "falta"]);
    expect(abasDaColecao("customizada")).toEqual(["inteiro"]);
  });

  it("a aba da URL vale só se o tipo a tem", () => {
    expect(abaDaUrl("falta", "set")).toBe("falta");
    expect(abaDaUrl(null, "pokedex")).toBe("fichario");
    expect(abaDaUrl("xyz", "set")).toBe("fichario");
    expect(abaDaUrl("falta", "customizada")).toBe("inteiro");
    expect(abaDaUrl("fichario", "customizada")).toBe("inteiro");
  });
});

describe("vagas da aba e o foco de volta", () => {
  const vagas = [
    { id: "a", copia: 1, upgrade: "variante" },
    { id: "b" },
    { id: "c", copia: 1 },
    { id: "d" },
  ];

  it("cada aba mostra a sua parte, na ordem da grade", () => {
    expect(vagasDaAba("fichario", vagas).map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
    expect(vagasDaAba("inteiro", vagas).map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
    expect(vagasDaAba("falta", vagas).map((v) => v.id)).toEqual(["b", "d"]);
    expect(vagasDaAba("upgrades", vagas).map((v) => v.id)).toEqual(["a"]);
  });

  it("a própria vaga, se ainda está; senão a do mesmo lugar, ou a última", () => {
    const falta = vagasDaAba("falta", vagas);
    expect(vagaDoFoco(falta, "d", 1)?.id).toBe("d");
    // "b" foi alocada: saiu do "O que falta"; o lugar 0 agora é "d".
    expect(vagaDoFoco(falta.filter((v) => v.id !== "b"), "b", 0)?.id).toBe("d");
    expect(vagaDoFoco(falta, "x", 9)?.id).toBe("d");
    expect(vagaDoFoco([], "a", 0)).toBeNull();
  });
});

describe("preferências guardadas", () => {
  it("fichário: só 3, 4, 5 ou 6; o resto cai em 3", () => {
    expect(lerGradeFichario("5")).toBe(5);
    expect(lerGradeFichario(null)).toBe(3);
    expect(lerGradeFichario("7")).toBe(3);
    expect(lerGradeFichario("lixo")).toBe(3);
  });

  it("tamanho da lista inteira: 0 a 3; o resto cai em 1", () => {
    expect(lerTamanhoInteiro("0")).toBe(0);
    expect(lerTamanhoInteiro("3")).toBe(3);
    expect(lerTamanhoInteiro(null)).toBe(1);
    expect(lerTamanhoInteiro("4")).toBe(1);
    expect(lerTamanhoInteiro("1.5")).toBe(1);
  });

  it("o vão entre células nunca fica abaixo de 8 px (alvos de toque separados)", () => {
    for (const t of [0, 1, 2, 3] as const) expect(vaoDoTamanho(t).x).toBeGreaterThanOrEqual(8);
  });
});

describe("fichário", () => {
  it("páginas, e a página de uma vaga", () => {
    expect(totalDePaginas(165, 3)).toBe(19);
    expect(totalDePaginas(1025, 6)).toBe(29);
    expect(totalDePaginas(0, 3)).toBe(1);
    expect(paginaDoIndice(0, 3)).toBe(0);
    expect(paginaDoIndice(9, 3)).toBe(1);
    expect(paginaDoIndice(1024, 6)).toBe(28);
  });

  it("com duas páginas abertas, a vista começa numa página par", () => {
    expect(inicioDaVista(5, 2, 19)).toBe(4);
    expect(inicioDaVista(4, 2, 19)).toBe(4);
    expect(inicioDaVista(5, 1, 19)).toBe(5);
    expect(inicioDaVista(40, 1, 19)).toBe(18);
    expect(inicioDaVista(-3, 2, 19)).toBe(0);
  });

  it("a faixa da última página para no total", () => {
    expect(faixaDaPagina(18, 3, 165)).toEqual({ inicio: 162, fim: 165 });
    expect(faixaDaPagina(19, 3, 165)).toEqual({ inicio: 165, fim: 165 });
  });
});

describe("grade que cabe", () => {
  it("bolsos de 44 px com 8 px entre eles", () => {
    // 320 px: 288 de conteúdo menos 2 × 10 de respiro da página = 268.
    expect(maiorGradeQueCabe(268)).toBe(5);
    // 393 px: 361 − 20 = 341.
    expect(maiorGradeQueCabe(341)).toBe(6);
    expect(maiorGradeQueCabe(304)).toBe(6);
    expect(maiorGradeQueCabe(303)).toBe(5);
    expect(maiorGradeQueCabe(100)).toBe(3);
  });

  it("a preferência vale até onde cabe, e editando vai até 4×4", () => {
    expect(gradeEfetiva(6, 268, false)).toBe(5);
    expect(gradeEfetiva(6, 600, false)).toBe(6);
    expect(gradeEfetiva(6, 600, true)).toBe(4);
    expect(gradeEfetiva(3, 268, true)).toBe(3);
  });

  it("editando, a lista inteira começa no tamanho G", () => {
    expect(tamanhoEfetivo(0, true)).toBe(2);
    expect(tamanhoEfetivo(3, true)).toBe(3);
    expect(tamanhoEfetivo(0, false)).toBe(0);
  });
});

describe("gesto de virar", () => {
  it("arrasto horizontal largo vira; para a esquerda é a próxima", () => {
    expect(sentidoDoGesto({ xInicio: 200, dx: -80, dy: 10 })).toBe(1);
    expect(sentidoDoGesto({ xInicio: 200, dx: 80, dy: 10 })).toBe(-1);
  });

  it("curto, mais vertical que horizontal, ou da borda do voltar: não vira", () => {
    expect(sentidoDoGesto({ xInicio: 200, dx: -30, dy: 0 })).toBe(0);
    expect(sentidoDoGesto({ xInicio: 200, dx: -80, dy: 70 })).toBe(0);
    expect(sentidoDoGesto({ xInicio: 10, dx: 120, dy: 0 })).toBe(0);
  });
});

describe("divisões", () => {
  it("onde cada divisão começa, na ordem das vagas", () => {
    const inicio = inicioDasDivisoes([{ divisao: "a" }, { divisao: "a" }, {}, { divisao: "b" }, { divisao: "a" }]);
    expect([...inicio]).toEqual([
      ["a", 0],
      ["b", 3],
    ]);
  });
});

describe("proximoEscopo", () => {
  it("ligar a última região que faltava volta a ser nacional", () => {
    const quase = { escopo: "regioes" as const, regioes: REGIOES.filter((r) => r !== "paldea") };
    expect(proximoEscopo(quase, "paldea", true)).toEqual({ escopo: "nacional" });
  });

  it("tirar uma do nacional lista as outras, na ordem canônica", () => {
    const r = proximoEscopo({ escopo: "nacional" }, "kanto", false);
    expect(r).toEqual({ escopo: "regioes", regioes: REGIOES.filter((x) => x !== "kanto") });
  });

  it("ligar mantém a ordem canônica, não a do clique", () => {
    expect(proximoEscopo({ escopo: "regioes", regioes: ["johto"] }, "kanto", true)).toEqual({
      escopo: "regioes",
      regioes: ["kanto", "johto"],
    });
  });

  it("tirar a última região não é pedido", () => {
    expect(proximoEscopo({ escopo: "regioes", regioes: ["kanto"] }, "kanto", false)).toBeNull();
  });
});

describe("umaLinhaPorCarta", () => {
  const linha = (setId: string, localId: string, idiomaCatalogo: "pt" | "en" | "jp") => ({ setId, localId, idiomaCatalogo });

  it("uma por carta, preferindo o idioma da coleção", () => {
    const r = umaLinhaPorCarta([linha("sv1", "1", "en"), linha("sv1", "1", "pt"), linha("sv1", "2", "en")], "pt");
    expect(r).toEqual([linha("sv1", "1", "pt"), linha("sv1", "2", "en")]);
  });

  it("japonês nunca entra numa coleção pt/en, nem o contrário", () => {
    expect(umaLinhaPorCarta([linha("neo1", "1", "jp"), linha("neo1", "1", "en")], "en")).toEqual([linha("neo1", "1", "en")]);
    expect(umaLinhaPorCarta([linha("neo1", "1", "jp"), linha("neo1", "1", "en")], "jp")).toEqual([linha("neo1", "1", "jp")]);
  });
});

describe("marcasAposReler", () => {
  const c = (copiaId: string, extra: Partial<{ quantidade: number; jaNaColecao: boolean; foraDePadrao: boolean; marcadaPorPadrao: boolean }> = {}) => ({
    copiaId,
    quantidade: 1,
    jaNaColecao: false,
    foraDePadrao: false,
    marcadaPorPadrao: true,
    ...extra,
  });

  it("primeira leitura: o padrão do servidor, e fora de padrão nunca", () => {
    const r = marcasAposReler([c("a"), c("b", { marcadaPorPadrao: false }), c("x", { foraDePadrao: true })], null, new Set());
    expect([...r]).toEqual(["a"]);
  });

  it("releitura: mantém o que estava marcado e não mudou; o que mudou volta desmarcado", () => {
    const antes = new Map([
      ["a", "1|false"],
      ["b", "2|false"],
      ["d", "1|false"],
    ]);
    const lida = [c("a"), c("b", { quantidade: 1 }), c("d"), c("novo")];
    const r = marcasAposReler(lida, antes, new Set(["a", "b"]));
    // a: igual e marcada; b: o lote mudou; d: igual mas desmarcada; novo: padrão.
    expect([...r].sort()).toEqual(["a", "novo"]);
  });
});
