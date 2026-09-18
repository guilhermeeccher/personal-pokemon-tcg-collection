import { describe, expect, it } from "vitest";

import { decidirResyncSet } from "./resync-set";

const ativas = (...ids: string[]) => ids.map((id) => ({ id, ativa: true }));

describe("decidirResyncSet", () => {
  it("pula o set quando a lista de cartas é idêntica", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1", "base1-2", "base1-3"],
      linhasLocais: ativas("base1-1", "base1-2", "base1-3"),
    });
    expect(decisao.precisaResync).toBe(false);
    expect(decisao.motivo).toBe("inalterado");
  });

  it("ignora a ordem — é comparação de conjunto", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-3", "base1-1", "base1-2"],
      linhasLocais: ativas("base1-1", "base1-2", "base1-3"),
    });
    expect(decisao.precisaResync).toBe(false);
  });

  it("revisita quando o set é novo no catálogo local", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["SM3H-001"],
      linhasLocais: [],
    });
    expect(decisao.precisaResync).toBe(true);
    expect(decisao.motivo).toContain("novo");
  });

  it("revisita quando aparece carta nova no upstream", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1", "base1-2", "base1-3"],
      linhasLocais: ativas("base1-1", "base1-2"),
    });
    expect(decisao.precisaResync).toBe(true);
    expect(decisao.motivo).toContain("1 carta(s) nova(s)");
  });

  it("revisita quando carta some do upstream — é o gatilho da inativação", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1"],
      linhasLocais: ativas("base1-1", "base1-2"),
    });
    expect(decisao.precisaResync).toBe(true);
    expect(decisao.motivo).toContain("fora do upstream");
  });

  it("não fica em resync eterno por causa de carta inativada de propósito", () => {
    // Carta que sumiu do upstream numa rodada anterior segue gravada como
    // inativa. O set está correto e precisa ser pulável, senão paga
    // requisição de detalhe para sempre.
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1", "base1-2"],
      linhasLocais: [
        ...ativas("base1-1", "base1-2"),
        { id: "base1-99", ativa: false },
      ],
    });
    expect(decisao.precisaResync).toBe(false);
  });

  it("revisita quando uma carta inativada volta a existir no upstream", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1", "base1-99"],
      linhasLocais: [
        ...ativas("base1-1"),
        { id: "base1-99", ativa: false },
      ],
    });
    expect(decisao.precisaResync).toBe(true);
    expect(decisao.motivo).toContain("nova");
  });

  it("modo profundo revisita mesmo o set idêntico", () => {
    const decisao = decidirResyncSet({
      idsUpstream: ["base1-1"],
      linhasLocais: ativas("base1-1"),
      profundo: true,
    });
    expect(decisao.precisaResync).toBe(true);
    expect(decisao.motivo).toBe("modo profundo");
  });
});
