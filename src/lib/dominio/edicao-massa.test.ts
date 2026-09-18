import { describe, expect, it } from "vitest";

import { validarEdicaoEmMassa } from "./edicao-massa";

const UUID_1 = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("validarEdicaoEmMassa", () => {
  it("valida um patch mínimo com um campo", () => {
    const resultado = validarEdicaoEmMassa({
      copiaIds: [UUID_1, UUID_2],
      patch: { condicao: "LP" },
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.edicao.copiaIds).toEqual([UUID_1, UUID_2]);
    expect(resultado.edicao.patch).toEqual({ condicao: "LP" });
  });

  it("aceita os quatro campos editáveis juntos", () => {
    const resultado = validarEdicaoEmMassa({
      copiaIds: [UUID_1],
      patch: { condicao: "NM", localizacao: "Fichário 2", idioma: "en", variante: "holo" },
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.edicao.patch).toEqual({
      condicao: "NM",
      localizacao: "Fichário 2",
      idioma: "en",
      variante: "holo",
    });
  });

  it("localizacao vazia vira null (limpa o campo)", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: { localizacao: "" } });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.edicao.patch.localizacao).toBeNull();
  });

  it("recusa copiaIds ausente ou vazio", () => {
    expect(validarEdicaoEmMassa({ patch: { condicao: "NM" } }).ok).toBe(false);
    expect(validarEdicaoEmMassa({ copiaIds: [], patch: { condicao: "NM" } }).ok).toBe(false);
  });

  it("recusa id que não é uuid", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: ["nao-uuid"], patch: { condicao: "NM" } });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erros.some((e) => e.includes("nao-uuid"))).toBe(true);
  });

  it("deduplica ids repetidos na seleção", () => {
    const resultado = validarEdicaoEmMassa({
      copiaIds: [UUID_1, UUID_1, UUID_2],
      patch: { condicao: "NM" },
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava ok");
    expect(resultado.edicao.copiaIds).toEqual([UUID_1, UUID_2]);
  });

  it("recusa patch vazio (nenhum campo)", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: {} });
    expect(resultado.ok).toBe(false);
  });

  it("recusa patch ausente", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1] });
    expect(resultado.ok).toBe(false);
  });

  it("recusa condicao inválida", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: { condicao: "XX" } });
    expect(resultado.ok).toBe(false);
  });

  it("recusa idioma inválido", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: { idioma: "fr" } });
    expect(resultado.ok).toBe(false);
  });

  it("recusa variante inválida", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: { variante: "shiny" } });
    expect(resultado.ok).toBe(false);
  });

  it("recusa campo fora do whitelist (quantidade não é editável em massa)", () => {
    const resultado = validarEdicaoEmMassa({ copiaIds: [UUID_1], patch: { quantidade: 5 } });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erros.some((e) => e.includes("quantidade"))).toBe(true);
  });

  it("recusa idiomaCatalogo (identidade da carta, nunca editável)", () => {
    const resultado = validarEdicaoEmMassa({
      copiaIds: [UUID_1],
      patch: { idiomaCatalogo: "en" },
    });
    expect(resultado.ok).toBe(false);
  });

  it("recusa notas, graded e aquisição — não fazem sentido em lote", () => {
    const resultado = validarEdicaoEmMassa({
      copiaIds: [UUID_1],
      patch: { notas: "x", gradedEmpresa: "PSA", aquisicaoPreco: 10 },
    });
    expect(resultado.ok).toBe(false);
  });
});
