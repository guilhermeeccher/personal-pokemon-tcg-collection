import { describe, expect, it } from "vitest";

import { hrefCadastroDex, hrefTrofeus } from "./caminhos";

describe("caminhos da Dex", () => {
  it("o cadastro leva o número na chave que a v1 lê", () => {
    expect(hrefCadastroDex(25)).toBe("/dex/cadastrar?busca=25");
  });

  it("os troféus levam o jogo codificado", () => {
    expect(hrefTrofeus("home")).toBe("/dex/trofeus?jogo=home");
    expect(hrefTrofeus("a b&c")).toBe("/dex/trofeus?jogo=a%20b%26c");
  });
});
