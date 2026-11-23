import { describe, expect, it } from "vitest";

import { idiomaDaGradeDoSet, lerCatalogoPedido } from "./catalogo-grade-set";
import { escolherLinhaPorCarta } from "./idioma-catalogo";

describe("lerCatalogoPedido", () => {
  it("ausente é o padrão", () => {
    expect(lerCatalogoPedido([])).toEqual({ ok: true, catalogo: null });
  });

  it("jp é o japonês", () => {
    expect(lerCatalogoPedido(["jp"])).toEqual({ ok: true, catalogo: "jp" });
  });

  it.each([[[""]], [["JP"]], [["ja"]], [["pt"]], [["en"]], [["ocidental"]], [["jp", "jp"]], [["jp", "en"]]])(
    "recusa %j em vez de cair no padrão",
    (valores) => {
      expect(lerCatalogoPedido(valores)).toEqual({ ok: false });
    },
  );
});

describe("idiomaDaGradeDoSet", () => {
  it("sem pedido segue a prioridade de sempre (pt > en > jp)", () => {
    expect(idiomaDaGradeDoSet(["en", "pt"], null)).toBe("pt");
    expect(idiomaDaGradeDoSet(["en"], null)).toBe("en");
    // neo1: existe em en e jp; o padrão é o ocidental.
    expect(idiomaDaGradeDoSet(["jp", "en"], null)).toBe("en");
    // Set só japonês: o padrão já é o japonês, sem pedido.
    expect(idiomaDaGradeDoSet(["jp"], null)).toBe("jp");
  });

  it("com o pedido japonês, só o japonês", () => {
    expect(idiomaDaGradeDoSet(["jp", "en"], "jp")).toBe("jp");
    expect(idiomaDaGradeDoSet(["jp"], "jp")).toBe("jp");
  });

  it("o pedido japonês num set sem ficha japonesa não tem grade", () => {
    expect(idiomaDaGradeDoSet(["pt", "en"], "jp")).toBeNull();
    expect(idiomaDaGradeDoSet([], "jp")).toBeNull();
  });

  it("neo1: o japonês traz as 96 cartas 001..096, o ocidental as 111 1..111, sem misturar", () => {
    // Linhas inventadas no formato do catálogo (nenhum dado de coleção).
    const en = Array.from({ length: 111 }, (_, i) => ({ localId: String(i + 1), idioma: "en" as const }));
    const jp = Array.from({ length: 96 }, (_, i) => ({ localId: String(i + 1).padStart(3, "0"), idioma: "jp" as const }));
    const linhas = [...en, ...jp];

    const idiomaJp = idiomaDaGradeDoSet(["en", "jp"], "jp");
    expect(idiomaJp).toBe("jp");
    const gradeJp = escolherLinhaPorCarta(linhas, idiomaJp!);
    expect(gradeJp).toHaveLength(96);
    expect(gradeJp.every((l) => l.idioma === "jp")).toBe(true);

    const idiomaOcidental = idiomaDaGradeDoSet(["en", "jp"], null);
    expect(idiomaOcidental).toBe("en");
    const gradeOcidental = escolherLinhaPorCarta(linhas, idiomaOcidental!);
    expect(gradeOcidental).toHaveLength(111);
    expect(gradeOcidental.every((l) => l.idioma === "en")).toBe(true);
  });
});
