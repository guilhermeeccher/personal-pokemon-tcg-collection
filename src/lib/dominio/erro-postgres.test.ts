import { describe, expect, it } from "vitest";

import { restricaoUnicaViolada } from "./erro-postgres";

describe("restricaoUnicaViolada", () => {
  it("acha a violação no próprio erro (postgres-js usa constraint_name)", () => {
    expect(restricaoUnicaViolada({ code: "23505", constraint_name: "vaga_copia_id_unique" })).toBe(
      "vaga_copia_id_unique",
    );
  });

  it("desembrulha o erro do Drizzle pela cadeia de cause", () => {
    const original = { code: "23505", constraint: "vaga_colecao_chave_unique" };
    const embrulhado = Object.assign(new Error("Failed query"), { cause: original });
    expect(restricaoUnicaViolada(embrulhado)).toBe("vaga_colecao_chave_unique");
  });

  it("devolve null para outro erro e não se perde num ciclo", () => {
    expect(restricaoUnicaViolada(new Error("outro"))).toBeNull();
    expect(restricaoUnicaViolada({ code: "23503" })).toBeNull();
    const ciclo: { cause?: unknown } = {};
    ciclo.cause = ciclo;
    expect(restricaoUnicaViolada(ciclo)).toBeNull();
    expect(restricaoUnicaViolada(null)).toBeNull();
  });
});
