import { describe, expect, it } from "vitest";

import { destinoV1 } from "./destino-v1";

/* O que o navegador leria da query do destino: a prova de que ela chega à
   tela da v1 com os mesmos valores que a ponte recebeu. */
const lerQuery = (destino: string) => [...new URL(destino, "http://x").searchParams.entries()];

describe("destinoV1: caminho", () => {
  it("a raiz vai para /v1, sem barra no fim", () => {
    expect(destinoV1([])).toBe("/v1");
    expect(destinoV1([], {})).toBe("/v1");
  });

  it("prefixa as telas estáticas", () => {
    expect(destinoV1(["colecoes"])).toBe("/v1/colecoes");
    expect(destinoV1(["inventario", "visao-geral"])).toBe("/v1/inventario/visao-geral");
    expect(destinoV1(["dex", "cadastrar"])).toBe("/v1/dex/cadastrar");
  });

  it("o [id] vai como o Next entrega, com os escapes da URL", () => {
    const uuid = "37a2fdeb-9174-4c89-98c7-32320f6741eb";
    expect(destinoV1(["colecoes", uuid, "opcoes-compra"])).toBe(`/v1/colecoes/${uuid}/opcoes-compra`);
    /* Medido no Next 16.3: `/colecoes/a%20b%C3%A9%2Fc%25` dá este `id`, cru.
       A tela da v1 tem de receber o mesmo, então nada é codificado de novo. */
    expect(destinoV1(["colecoes", "a%20b%C3%A9%2Fc%25"])).toBe("/v1/colecoes/a%20b%C3%A9%2Fc%25");
    expect(destinoV1(["dex", "d%20e", "%C3%A9"])).toBe("/v1/dex/d%20e/%C3%A9");
  });

  it("codifica o que não pode ir cru num segmento", () => {
    expect(destinoV1(["colecoes", "a/b?c#d", "opcoes-compra"])).toBe("/v1/colecoes/a%2Fb%3Fc%23d/opcoes-compra");
    expect(destinoV1(["colecoes", "a\\b"])).toBe("/v1/colecoes/a%5Cb");
    expect(destinoV1(["colecoes", "ação 1"])).toBe("/v1/colecoes/a%C3%A7%C3%A3o%201");
    expect(destinoV1(["colecoes", "\u{1F525}"])).toBe("/v1/colecoes/%F0%9F%94%A5");
    expect(destinoV1(["colecoes", "a:b@c!$&'()*+,;=~"])).toBe("/v1/colecoes/a:b@c!$&'()*+,;=~");
  });

  it("um segmento de pontos não sobe de pasta, nem escrito como %2E", () => {
    expect(destinoV1(["colecoes", "..", "opcoes-compra"])).toBe("/v1/colecoes/%252E%252E/opcoes-compra");
    expect(destinoV1(["dex", "."])).toBe("/v1/dex/%252E");
    expect(destinoV1(["dex", "%2e%2E"])).toBe("/v1/dex/%252E%252E");
    /* O navegador é quem resolve: o caminho continua na mesma tela. */
    const resolvido = (d: string) => new URL(d, "http://x").pathname;
    expect(resolvido(destinoV1(["colecoes", "..", "x"]))).toBe("/v1/colecoes/%252E%252E/x");
    expect(resolvido(destinoV1(["dex", "..", "%2E."]))).toBe("/v1/dex/%252E%252E/%252E%252E");
    expect(resolvido(destinoV1(["dex", "a..", "..b"]))).toBe("/v1/dex/a../..b");
  });

  it("sempre um caminho do próprio site, nunca outro host", () => {
    for (const s of ["", "/evil.example", "//evil.example", "\\evil.example", "http://evil.example"]) {
      const destino = destinoV1([s, "x"]);
      expect(destino.startsWith("/v1/")).toBe(true);
      expect(new URL(destino, "http://site").host).toBe("site");
    }
  });
});

describe("destinoV1: query", () => {
  it("sem query, sem ?", () => {
    expect(destinoV1(["inventario"], { x: undefined })).toBe("/v1/inventario");
  });

  it("mantém chave e valor simples", () => {
    expect(destinoV1(["inventario"], { set: "sv01", idioma: "pt" })).toBe("/v1/inventario?set=sv01&idioma=pt");
  });

  it("chave repetida continua repetida, na ordem", () => {
    const destino = destinoV1(["inventario"], { raridade: ["Rara", "Comum"], set: "sv01" });
    expect(lerQuery(destino)).toEqual([
      ["raridade", "Rara"],
      ["raridade", "Comum"],
      ["set", "sv01"],
    ]);
  });

  it("acento, espaço, + e % voltam com o mesmo valor", () => {
    const busca = { busca: "Pokémon Ação", mais: "a+b", pct: "100%", amp: "a&b=c", vazio: "" };
    const destino = destinoV1(["cadastro", "busca"], busca);
    expect(destino).toBe(
      "/v1/cadastro/busca?busca=Pok%C3%A9mon+A%C3%A7%C3%A3o&mais=a%2Bb&pct=100%25&amp=a%26b%3Dc&vazio=",
    );
    expect(Object.fromEntries(lerQuery(destino))).toEqual(busca);
  });

  it("a query da Dex vai junto com o resto do caminho", () => {
    expect(destinoV1(["dex", "cadastrar"], { jogo: "a", busca: "b" })).toBe("/v1/dex/cadastrar?jogo=a&busca=b");
  });

  it("a chave também é codificada", () => {
    const destino = destinoV1(["inventario"], { "ç x": "1" });
    expect(lerQuery(destino)).toEqual([["ç x", "1"]]);
  });
});
