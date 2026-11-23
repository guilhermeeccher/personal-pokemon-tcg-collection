import { describe, expect, it } from "vitest";

import { TAMANHO_PAGINA_REPETIDAS, filtrosDaUrl, hrefRepetidas, totalDePaginas } from "./repetidas-v2";

describe("filtrosDaUrl", () => {
  it("sem nada na URL: todas as repetidas, página 1", () => {
    expect(filtrosDaUrl({})).toEqual({ soLivres: false, pagina: 1, tamanhoPagina: TAMANHO_PAGINA_REPETIDAS });
  });
  it("lê os mesmos valores da API", () => {
    expect(filtrosDaUrl({ soLivres: "true", pagina: "3" })).toMatchObject({ soLivres: true, pagina: 3 });
    expect(filtrosDaUrl({ soLivres: "false" })).toMatchObject({ soLivres: false });
  });
  it("um valor que não se entende cai no padrão, sem derrubar o outro", () => {
    expect(filtrosDaUrl({ soLivres: "sim", pagina: "2" })).toMatchObject({ soLivres: false, pagina: 2 });
    expect(filtrosDaUrl({ soLivres: "true", pagina: "0" })).toMatchObject({ soLivres: true, pagina: 1 });
    expect(filtrosDaUrl({ pagina: "abc" })).toMatchObject({ pagina: 1 });
  });
  it("com a chave repetida vale a primeira", () => {
    expect(filtrosDaUrl({ pagina: ["4", "9"] })).toMatchObject({ pagina: 4 });
  });
  it("o tamanho da página não vem da URL", () => {
    expect(filtrosDaUrl({ tamanhoPagina: "200" }).tamanhoPagina).toBe(TAMANHO_PAGINA_REPETIDAS);
  });
});

describe("totalDePaginas", () => {
  it("é pelo menos 1, mesmo sem nenhuma repetida", () => {
    expect(totalDePaginas(0, 48)).toBe(1);
    expect(totalDePaginas(48, 48)).toBe(1);
    expect(totalDePaginas(49, 48)).toBe(2);
  });
});

describe("hrefRepetidas", () => {
  it("os padrões não aparecem na URL", () => {
    expect(hrefRepetidas({ soLivres: false, pagina: 1 })).toBe("/inventario/repetidas");
  });
  it("leva só o que difere do padrão", () => {
    expect(hrefRepetidas({ soLivres: true, pagina: 1 })).toBe("/inventario/repetidas?soLivres=true");
    expect(hrefRepetidas({ soLivres: false, pagina: 2 })).toBe("/inventario/repetidas?pagina=2");
    expect(hrefRepetidas({ soLivres: true, pagina: 5 })).toBe("/inventario/repetidas?soLivres=true&pagina=5");
  });
});
