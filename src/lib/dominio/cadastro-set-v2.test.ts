import { describe, expect, it } from "vitest";

import {
  caminhoGradeDoSet,
  lerRespostaLote,
  proximaCarta,
  quantidadeDoTexto,
  resultadoPorLinha,
  totaisDoLote,
  valoresDaCarta,
} from "./cadastro-set-v2";
import { DEFAULTS_INICIAIS, construirItensSubmissao, estadoGradeInicial, reduzirGrade } from "./grade-set";
import type { FlagsVariantesCatalogo } from "./variantes-catalogo";

const TODAS: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: true,
  varianteReverseDisponivel: true,
  varianteHoloDisponivel: true,
  variantePrimeiraEdicaoDisponivel: true,
  variantePromoDisponivel: true,
};
const SO_HOLO: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: false,
  varianteReverseDisponivel: false,
  varianteHoloDisponivel: true,
  variantePrimeiraEdicaoDisponivel: false,
  variantePromoDisponivel: false,
};

describe("caminhoGradeDoSet", () => {
  it("ocidental é o pedido da v1, sem parâmetro", () => {
    expect(caminhoGradeDoSet("neo1", "ocidental")).toBe("/api/sets/neo1/cartas");
  });
  it("japonês vai pedido", () => {
    expect(caminhoGradeDoSet("neo1", "jp")).toBe("/api/sets/neo1/cartas?catalogo=jp");
  });
  it("escapa o id", () => {
    expect(caminhoGradeDoSet("a/b c", "ocidental")).toBe("/api/sets/a%2Fb%20c/cartas");
  });
});

describe("valoresDaCarta", () => {
  it("carta não marcada mostra o padrão do lote", () => {
    expect(valoresDaCarta(undefined, DEFAULTS_INICIAIS, TODAS)).toEqual({
      variante: "normal",
      idioma: "pt",
      condicao: "NM",
      ajustes: [],
      semVarianteDoPadrao: false,
      varianteNoLugar: null,
    });
  });

  it("carta sem a variante do padrão mostra a que vai gravar e avisa", () => {
    const v = valoresDaCarta(undefined, DEFAULTS_INICIAIS, SO_HOLO);
    expect(v.variante).toBe("holo");
    expect(v.semVarianteDoPadrao).toBe(true);
    expect(v.varianteNoLugar).toBe("holo");
    // A troca automática é aviso, não ajuste da pessoa.
    expect(v.ajustes).toEqual([]);
  });

  it("a variante escolhida à mão numa carta sem a do padrão é ajuste, não aviso", () => {
    const flags = { ...SO_HOLO, varianteReverseDisponivel: true };
    const v = valoresDaCarta({ quantidade: 1, variante: "holo" }, DEFAULTS_INICIAIS, flags);
    expect(v.varianteNoLugar).toBeNull();
    expect(v.semVarianteDoPadrao).toBe(true);
    expect(v.ajustes).toContain("variante");
  });

  it("o que mostra é o que a marcação materializa", () => {
    const estado = reduzirGrade(estadoGradeInicial(), { tipo: "quantidade", cartaId: "A", valor: 1, flags: SO_HOLO });
    const antes = valoresDaCarta(undefined, DEFAULTS_INICIAIS, SO_HOLO);
    const depois = valoresDaCarta(estado.linhas.A, estado.defaults, SO_HOLO);
    expect(depois).toEqual(antes);
  });

  it("lista os campos ajustados na carta", () => {
    const v = valoresDaCarta({ quantidade: 1, idioma: "jp", condicao: "LP" }, DEFAULTS_INICIAIS, TODAS);
    expect(v.ajustes).toEqual(["idioma", "condicao"]);
    expect(v.variante).toBe("normal");
  });
});

describe("totaisDoLote", () => {
  it("conta cartas e cópias, ignorando as zeradas", () => {
    let e = estadoGradeInicial();
    e = reduzirGrade(e, { tipo: "quantidade", cartaId: "A", valor: 3, flags: TODAS });
    e = reduzirGrade(e, { tipo: "quantidade", cartaId: "B", valor: 1, flags: TODAS });
    e = reduzirGrade(e, { tipo: "quantidade", cartaId: "C", valor: 0, flags: TODAS });
    expect(totaisDoLote(e)).toEqual({ cartas: 2, copias: 4 });
  });
});

describe("quantidadeDoTexto", () => {
  it.each([
    ["", 0],
    ["0", 0],
    ["3", 3],
    ["03", 3],
    ["1a2", 12],
    ["-4", 4],
    ["2.5", 25],
    ["123456", 1234],
  ])("%j → %d", (texto, esperado) => {
    expect(quantidadeDoTexto(texto)).toBe(esperado);
  });
});

describe("proximaCarta", () => {
  it("a seguinte, e nula na última ou fora da lista", () => {
    expect(proximaCarta(["a", "b", "c"], "a")).toBe("b");
    expect(proximaCarta(["a", "b", "c"], "c")).toBeNull();
    expect(proximaCarta(["a", "b"], "z")).toBeNull();
  });
});

describe("lerRespostaLote", () => {
  it("lê as contagens do 201", () => {
    expect(lerRespostaLote(201, { inseridas: 3, fundidas: 1 })).toEqual({ tipo: "gravado", inseridas: 3, fundidas: 1 });
  });
  it("lê os detalhes da recusa da rota e descarta o malformado", () => {
    const r = lerRespostaLote(400, {
      recusa: { chave: "varianteForaDoCatalogoNoLote" },
      detalhes: [{ indice: 1, cartaId: "b", motivo: "x" }, { indice: "2" }, null, { indice: -1, cartaId: null }],
    });
    expect(r).toEqual({ tipo: "recusado", detalhes: [{ indice: 1, cartaId: "b" }, { indice: -1, cartaId: null }] });
  });
  it("recusa sem detalhes ainda é recusa", () => {
    expect(lerRespostaLote(400, { recusa: { chave: "falhaAoGravarLote" } })).toEqual({ tipo: "recusado", detalhes: [] });
  });
  it.each([
    [502, null],
    [504, "upstream timeout"],
    [500, { recusa: { chave: "x" } }],
    [400, { erro: "Corpo inválido (JSON esperado)." }],
    [400, null],
    [401, { erro: "nao_autenticado" }],
    [201, null],
    [201, "x"],
  ])("%d com %j é incerto: o lote pode ter entrado", (status, corpo) => {
    expect(lerRespostaLote(status, corpo)).toEqual({ tipo: "incerto" });
  });
});

describe("resultadoPorLinha", () => {
  let e = estadoGradeInicial();
  e = reduzirGrade(e, { tipo: "quantidade", cartaId: "a", valor: 1, flags: TODAS });
  e = reduzirGrade(e, { tipo: "quantidade", cartaId: "b", valor: 2, flags: TODAS });
  const itens = construirItensSubmissao(e, () => "en");

  it("marca a linha recusada pelo índice", () => {
    const { linhas, geral } = resultadoPorLinha(itens, [{ indice: 1, cartaId: "b" }]);
    expect(linhas.map((l) => [l.item.cartaId, l.recusada])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(geral).toBe(false);
  });

  it("índice que não bate com a carta não marca a carta errada", () => {
    const { linhas, geral } = resultadoPorLinha(itens, [{ indice: 0, cartaId: "b" }]);
    expect(linhas.every((l) => !l.recusada)).toBe(true);
    expect(geral).toBe(true);
  });

  it("recusa do lote inteiro é geral", () => {
    const { linhas, geral } = resultadoPorLinha(itens, [{ indice: -1, cartaId: null }]);
    expect(linhas.every((l) => !l.recusada)).toBe(true);
    expect(geral).toBe(true);
  });
});
