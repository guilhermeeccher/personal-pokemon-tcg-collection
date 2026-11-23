import { describe, expect, it } from "vitest";

import { validarEdicaoCopia } from "@/lib/dominio/copia";
import type { CopiaDoDetalheV2DTO } from "@/lib/dominio/tipos-cliente";

import { corpoDaEdicao, formularioDaCopia } from "./edicao-copia";

/* Cópia inventada. */
const ORIGINAL: CopiaDoDetalheV2DTO = {
  id: "k0000000-0000-4000-8000-000000000001",
  idiomaCatalogo: "pt",
  idioma: "pt",
  variante: "normal",
  quantidade: 2,
  condicao: "NM",
  gradedEmpresa: null,
  gradedNota: null,
  gradedCertificado: null,
  localizacao: "Fichário 1",
  aquisicaoData: "2026-10-01",
  aquisicaoOrigem: null,
  aquisicaoPreco: "12.50",
  notas: null,
  criadoEm: "2026-10-01T12:00:00.000Z",
  alocacao: null,
};

describe("corpoDaEdicao", () => {
  it("o formulário intocado não gera pedido", () => {
    expect(corpoDaEdicao(ORIGINAL, formularioDaCopia(ORIGINAL))).toEqual({ ok: true, corpo: null });
  });

  it("só o que mudou vai no corpo", () => {
    const f = { ...formularioDaCopia(ORIGINAL), notas: "  troca da feira ", condicao: "LP" as const };
    expect(corpoDaEdicao(ORIGINAL, f)).toEqual({ ok: true, corpo: { notas: "troca da feira", condicao: "LP" } });
  });

  it("espaços em volta não contam como mudança; apagar vira null", () => {
    const igual = { ...formularioDaCopia(ORIGINAL), localizacao: "  Fichário 1  " };
    expect(corpoDaEdicao(ORIGINAL, igual)).toEqual({ ok: true, corpo: null });
    const apagado = { ...formularioDaCopia(ORIGINAL), localizacao: "   " };
    expect(corpoDaEdicao(ORIGINAL, apagado)).toEqual({ ok: true, corpo: { localizacao: null } });
  });

  it("regra 7: o idioma físico muda sozinho, sem tocar na ficha do catálogo", () => {
    const f = { ...formularioDaCopia(ORIGINAL), idioma: "jp" as const };
    const r = corpoDaEdicao(ORIGINAL, f);
    expect(r).toEqual({ ok: true, corpo: { idioma: "jp" } });
    expect(r.ok && r.corpo && "idiomaCatalogo" in r.corpo).toBe(false);
  });

  it("preço aceita vírgula e compara com duas casas", () => {
    expect(corpoDaEdicao(ORIGINAL, { ...formularioDaCopia(ORIGINAL), aquisicaoPreco: "12,5" })).toEqual({ ok: true, corpo: null });
    expect(corpoDaEdicao(ORIGINAL, { ...formularioDaCopia(ORIGINAL), aquisicaoPreco: "13" })).toEqual({
      ok: true,
      corpo: { aquisicaoPreco: "13.00" },
    });
    expect(corpoDaEdicao(ORIGINAL, { ...formularioDaCopia(ORIGINAL), aquisicaoPreco: "" })).toEqual({
      ok: true,
      corpo: { aquisicaoPreco: null },
    });
  });

  it("recusa quantidade, data e preço inválidos, sem montar corpo", () => {
    const f = { ...formularioDaCopia(ORIGINAL), quantidade: "0", aquisicaoData: "01/10/2026", aquisicaoPreco: "-3" };
    expect(corpoDaEdicao(ORIGINAL, f)).toEqual({ ok: false, erros: ["quantidade", "aquisicaoData", "aquisicaoPreco"] });
    expect(corpoDaEdicao(ORIGINAL, { ...formularioDaCopia(ORIGINAL), quantidade: "1.5" }).ok).toBe(false);
  });

  it("todo corpo que sai passa na validação da rota", () => {
    const f = {
      ...formularioDaCopia(ORIGINAL),
      quantidade: "3",
      variante: "reverse" as const,
      gradedEmpresa: "PSA",
      gradedNota: "9",
      gradedCertificado: "123",
      aquisicaoData: "",
      aquisicaoOrigem: "Loja",
      aquisicaoPreco: "0,99",
    };
    const r = corpoDaEdicao(ORIGINAL, f);
    expect(r.ok).toBe(true);
    if (!r.ok || !r.corpo) throw new Error("esperava corpo");
    const v = validarEdicaoCopia(r.corpo);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.patch).toEqual({ ...r.corpo });
  });
});
