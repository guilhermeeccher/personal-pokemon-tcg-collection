import { describe, expect, it } from "vitest";

import { type CopiaParaRepresentar, escolherRepresentantes } from "./copia-representante";

const c = (id: string, cartaId: string, alocada: boolean, criadoEmMs: number): CopiaParaRepresentar => ({
  id,
  cartaId,
  alocada,
  criadoEmMs,
});

describe("escolherRepresentantes", () => {
  it("prefere a cópia livre à alocada, mesmo a mais nova", () => {
    const r = escolherRepresentantes([c("a", "x", true, 1), c("b", "x", false, 9)]);
    expect(r.get("x")).toBe("b");
  });

  it("entre livres, escolhe a mais antiga", () => {
    const r = escolherRepresentantes([c("a", "x", false, 5), c("b", "x", false, 2), c("c", "x", false, 7)]);
    expect(r.get("x")).toBe("b");
  });

  it("se todas estão alocadas, escolhe a mais antiga", () => {
    const r = escolherRepresentantes([c("a", "x", true, 5), c("b", "x", true, 2)]);
    expect(r.get("x")).toBe("b");
  });

  it("desempata pelo id, sem depender da ordem de entrada", () => {
    const linhas = [c("b", "x", false, 1), c("a", "x", false, 1)];
    expect(escolherRepresentantes(linhas).get("x")).toBe("a");
    expect(escolherRepresentantes([...linhas].reverse()).get("x")).toBe("a");
  });

  it("separa as cartas e não inventa uma carta sem cópia", () => {
    const r = escolherRepresentantes([c("a", "x", false, 1), c("b", "y", true, 1)]);
    expect([...r.entries()].sort()).toEqual([
      ["x", "a"],
      ["y", "b"],
    ]);
    expect(r.has("z")).toBe(false);
    expect(escolherRepresentantes([]).size).toBe(0);
  });
});
