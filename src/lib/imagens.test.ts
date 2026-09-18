import { describe, expect, it } from "vitest";

import { urlImagemCarta, urlSpritePokemon } from "./imagens";

describe("urlImagemCarta", () => {
  it("acrescenta qualidade e formato às URLs do CDN da TCGdex", () => {
    // A URL gravada em `carta_catalogo.imagem_url` é um prefixo, não um
    // arquivo: sozinha ela devolve 404.
    expect(urlImagemCarta("https://assets.tcgdex.net/pt/sv/sv03.5/002")).toBe(
      "https://assets.tcgdex.net/pt/sv/sv03.5/002/low.webp",
    );
    expect(
      urlImagemCarta("https://assets.tcgdex.net/pt/sv/sv03.5/002", "high"),
    ).toBe("https://assets.tcgdex.net/pt/sv/sv03.5/002/high.webp");
  });

  it("NÃO mexe na URL da imagem que o usuário forneceu", () => {
    // Regressão de 2026-08-26: a primeira foto subida de verdade
    // não apareceu. A rota de imagem local devolve o arquivo em si, e o
    // sufixo transformava um 200 num 404 — a tela mostrava "+ foto" e
    // "trocar" ao mesmo tempo, um dizendo que a imagem falhou e o outro
    // que ela existe.
    expect(urlImagemCarta("/api/imagens-locais/mep-079/pt")).toBe(
      "/api/imagens-locais/mep-079/pt",
    );
    expect(urlImagemCarta("/api/imagens-locais/mep-079/pt", "high")).toBe(
      "/api/imagens-locais/mep-079/pt",
    );
  });

  it("devolve null sem URL", () => {
    expect(urlImagemCarta(null)).toBeNull();
  });
});

describe("urlSpritePokemon", () => {
  it("monta a URL pelo número da vaga", () => {
    expect(urlSpritePokemon("4")).toContain("/pokemon/4.png");
  });

  it("recusa número inválido em vez de montar URL quebrada", () => {
    expect(urlSpritePokemon("abc")).toBeNull();
    expect(urlSpritePokemon("0")).toBeNull();
  });
});
