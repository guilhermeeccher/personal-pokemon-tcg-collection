import { describe, expect, it } from "vitest";

import { categoriaConta, resolverSecoes } from "./dex-secoes";

describe("seções da Living Dex", () => {
  it("sem nenhuma linha gravada, todas as seções contam", () => {
    expect(resolverSecoes([])).toEqual({ regional: true, genero: true, cosmetica: true, especial: true });
  });

  it("linha gravada vence o padrão", () => {
    const secoes = resolverSecoes([{ categoria: "cosmetica", conta: false }]);
    expect(secoes.cosmetica).toBe(false);
    expect(secoes.regional).toBe(true);
  });

  it("base conta sempre, mesmo que alguém grave uma linha para ela", () => {
    const secoes = resolverSecoes([{ categoria: "base", conta: false }]);
    expect(categoriaConta("base", secoes)).toBe(true);
  });

  it("seção desligada não conta", () => {
    const secoes = resolverSecoes([{ categoria: "genero", conta: false }]);
    expect(categoriaConta("genero", secoes)).toBe(false);
  });
});
