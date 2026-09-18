import { describe, expect, it } from "vitest";

import { resolverIdiomaCatalogoDoSet } from "./idioma-catalogo";

describe("resolverIdiomaCatalogoDoSet", () => {
  it("usa pt quando o set tem carta a carta em pt", () => {
    expect(resolverIdiomaCatalogoDoSet(["pt", "en"])).toBe("pt");
  });

  it("cai para en quando o set não tem nenhuma carta em pt (regra 7 do AGENTS.md)", () => {
    // Caso real: base1 (Coleção Básica) tem 0 linhas em pt no catálogo.
    expect(resolverIdiomaCatalogoDoSet(["en"])).toBe("en");
  });

  it("usa jp em set exclusivo do Japão", () => {
    // Caso real: SM3H (闘う虹を見たか) só existe em japonês — é o set do
    // Charmander usado como caso real. Antes de 2026-08-26 esta função
    // devolvia "en" aqui, e a grade de cadastro respondia "Set não
    // encontrado" para os 116 sets nessa condição.
    expect(resolverIdiomaCatalogoDoSet(["jp"])).toBe("jp");
  });

  it("prefere pt e en ao japonês quando o set existe nos três", () => {
    expect(resolverIdiomaCatalogoDoSet(["jp", "en", "pt"])).toBe("pt");
    expect(resolverIdiomaCatalogoDoSet(["jp", "en"])).toBe("en");
  });

  it("devolve en quando o set não existe em idioma nenhum", () => {
    expect(resolverIdiomaCatalogoDoSet([])).toBe("en");
  });
});
