import { describe, expect, it } from "vitest";

import {
  construirItensSubmissao,
  estadoGradeInicial,
  reduzirGrade,
  type EstadoGrade,
} from "./grade-set";
import type { FlagsVariantesCatalogo } from "./variantes-catalogo";

const TODAS_DISPONIVEIS: FlagsVariantesCatalogo = {
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

function marcar(estado: EstadoGrade, cartaId: string, quantidade = 1): EstadoGrade {
  return reduzirGrade(estado, { tipo: "quantidade", cartaId, valor: quantidade, flags: TODAS_DISPONIVEIS });
}

describe("reduzirGrade — bug reportado: herança de variante contaminando linhas já marcadas", () => {
  it("marcar A, marcar B, trocar a variante de B não muda a variante de A (estado)", () => {
    let estado = estadoGradeInicial();
    estado = marcar(estado, "A");
    estado = marcar(estado, "B");

    expect(estado.linhas.A.variante).toBe("normal");
    expect(estado.linhas.B.variante).toBe("normal");

    estado = reduzirGrade(estado, { tipo: "campoLinha", cartaId: "B", campo: "variante", valor: "holo" });

    expect(estado.linhas.B.variante).toBe("holo");
    expect(estado.linhas.A.variante).toBe("normal"); // não contaminou

    // O padrão do lote NÃO avança: até 2026-08-26 avançava, e com ele
    // mudava o valor exibido em toda carta ainda não marcada — a grade
    // parecia mudar sozinha, e a carta marcada depois era gravada com a
    // variante herdada. Herança agora só pela barra do topo.
    expect(estado.defaults.variante).toBe("normal");
  });

  it("o mesmo vale para o payload de submissão, não só para o estado bruto", () => {
    let estado = estadoGradeInicial();
    estado = marcar(estado, "A");
    estado = marcar(estado, "B");
    estado = reduzirGrade(estado, { tipo: "campoLinha", cartaId: "B", campo: "variante", valor: "holo" });

    const itens = construirItensSubmissao(estado);
    const itemA = itens.find((i) => i.cartaId === "A");
    const itemB = itens.find((i) => i.cartaId === "B");

    expect(itemA?.variante).toBe("normal");
    expect(itemB?.variante).toBe("holo");
  });

  it("caso relatado: 40 cartas marcadas normal, a 41ª muda para holo — as 40 anteriores continuam normal", () => {
    let estado = estadoGradeInicial();
    const cartaIds = Array.from({ length: 40 }, (_, i) => `carta-${i}`);
    for (const id of cartaIds) {
      estado = marcar(estado, id);
    }
    // Uma 41ª carta, marcada e depois trocada para holo — como o
    // relato descreveu.
    estado = marcar(estado, "carta-holo");
    estado = reduzirGrade(estado, {
      tipo: "campoLinha",
      cartaId: "carta-holo",
      campo: "variante",
      valor: "holo",
    });

    const itens = construirItensSubmissao(estado);
    expect(itens).toHaveLength(41);
    for (const id of cartaIds) {
      const item = itens.find((i) => i.cartaId === id);
      expect(item?.variante).toBe("normal");
    }
    expect(itens.find((i) => i.cartaId === "carta-holo")?.variante).toBe("holo");
  });

  it("trocar o default pela barra geral (campoDefault) também não afeta linha já marcada", () => {
    let estado = estadoGradeInicial();
    estado = marcar(estado, "A");
    estado = reduzirGrade(estado, { tipo: "campoDefault", campo: "condicao", valor: "LP" });

    expect(estado.linhas.A.condicao).toBe("NM"); // materializado antes da troca
    expect(estado.defaults.condicao).toBe("LP");
  });

  it("linha marcada DEPOIS de uma troca de default usa o novo default", () => {
    let estado = estadoGradeInicial();
    estado = reduzirGrade(estado, { tipo: "campoDefault", campo: "variante", valor: "reverse" });
    estado = marcar(estado, "C");
    expect(estado.linhas.C.variante).toBe("reverse");
  });
});

describe("reduzirGrade — materialização respeita variantes disponíveis da carta", () => {
  it("caso Alakazam do Base Set: default 'normal' não existe para a carta -> materializa holo", () => {
    let estado = estadoGradeInicial(); // default inicial: variante normal
    estado = reduzirGrade(estado, {
      tipo: "quantidade",
      cartaId: "base1-1",
      valor: 1,
      flags: SO_HOLO,
    });
    expect(estado.linhas["base1-1"].variante).toBe("holo");
  });
});

describe("reduzirGrade — desmarcar e remarcar não perde o que já foi tocado", () => {
  it("zerar a quantidade mantém os campos já materializados", () => {
    let estado = estadoGradeInicial();
    estado = marcar(estado, "A");
    estado = reduzirGrade(estado, { tipo: "campoLinha", cartaId: "A", campo: "condicao", valor: "LP" });
    estado = marcar(estado, "A", 0);
    expect(estado.linhas.A.condicao).toBe("LP");
    expect(estado.linhas.A.quantidade).toBe(0);
  });
});

describe("construirItensSubmissao", () => {
  it("ignora linhas com quantidade 0", () => {
    let estado = estadoGradeInicial();
    estado = marcar(estado, "A");
    estado = marcar(estado, "B", 0);
    const itens = construirItensSubmissao(estado);
    expect(itens.map((i) => i.cartaId)).toEqual(["A"]);
  });
});

describe("mexer numa linha não contamina as cartas ainda não marcadas", () => {
  // O relato de uso em 2026-08-26: "mudar a variante de uma carta no
  // cadastro por set muda a variante de todas as cartas que estão sendo
  // exibidas". As já marcadas estavam protegidas desde 2026-08-24; o que
  // faltava eram as não marcadas, que exibem o padrão do lote — e eram
  // gravadas com ele ao serem marcadas depois.
  it("carta não marcada segue no padrão do lote depois de mexer noutra linha", () => {
    let estado = estadoGradeInicial();
    estado = reduzirGrade(estado, {
      tipo: "quantidade", cartaId: "c1", valor: 1, flags: TODAS_DISPONIVEIS,
    });
    estado = reduzirGrade(estado, {
      tipo: "campoLinha", cartaId: "c2", campo: "variante", valor: "holo",
    });

    // A grade exibe `linha?.variante ?? defaults.variante`.
    expect(estado.linhas.c2?.variante).toBe("holo");
    expect(estado.linhas.c3?.variante).toBeUndefined();
    expect(estado.defaults.variante).toBe("normal");
  });

  it("carta marcada DEPOIS não herda a variante mexida em outra linha", () => {
    let estado = estadoGradeInicial();
    estado = reduzirGrade(estado, {
      tipo: "campoLinha", cartaId: "c2", campo: "variante", valor: "holo",
    });
    estado = reduzirGrade(estado, {
      tipo: "quantidade", cartaId: "c4", valor: 1, flags: TODAS_DISPONIVEIS,
    });

    const item = construirItensSubmissao(estado).find((i) => i.cartaId === "c4");
    expect(item?.variante).toBe("normal");
  });

  it("a barra do topo continua definindo o padrão do lote", () => {
    let estado = estadoGradeInicial();
    estado = reduzirGrade(estado, {
      tipo: "campoDefault", campo: "variante", valor: "holo",
    });
    estado = reduzirGrade(estado, {
      tipo: "quantidade", cartaId: "c1", valor: 1, flags: TODAS_DISPONIVEIS,
    });

    const item = construirItensSubmissao(estado).find((i) => i.cartaId === "c1");
    expect(item?.variante).toBe("holo");
  });
});
