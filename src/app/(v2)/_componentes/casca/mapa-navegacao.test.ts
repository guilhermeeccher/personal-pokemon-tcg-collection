import { describe, expect, it } from "vitest";

import { ABAS, ITEM_BUSCA, abaAtiva, gruposDaNav, itemAtivo } from "./mapa-navegacao";

describe("gruposDaNav", () => {
  it("todo item aponta para a raiz, nunca para /v1", () => {
    for (const grupo of gruposDaNav(true)) {
      for (const item of grupo.itens) {
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.href === "/v1" || item.href.startsWith("/v1/")).toBe(false);
      }
    }
  });

  it("a Dex só aparece com o módulo ligado", () => {
    const hrefs = (dex: boolean) => gruposDaNav(dex).flatMap((g) => g.itens.map((i) => i.href));
    expect(hrefs(false).some((h) => h.startsWith("/dex"))).toBe(false);
    expect(hrefs(true)).toContain("/dex/pokedex");
  });

  it("nenhum href repetido", () => {
    const hrefs = gruposDaNav(true).flatMap((g) => g.itens.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("toda aba aponta para um item do mapa", () => {
    const itens = gruposDaNav(false).flatMap((g) => g.itens);
    for (const { item } of ABAS) expect(itens).toContain(item);
  });
});

describe("itemAtivo", () => {
  it("o prefixo mais longo vence, por segmento", () => {
    expect(itemAtivo("/inventario/precos")?.href).toBe("/inventario/precos");
    expect(itemAtivo("/inventario")?.href).toBe("/inventario");
    expect(itemAtivo("/colecoes/abc/opcoes-compra")?.href).toBe("/colecoes");
    expect(itemAtivo("/dex/pokedex")?.href).toBe("/dex/pokedex");
    expect(itemAtivo("/dex")?.href).toBe("/dex");
  });

  it("a raiz só casa com ela mesma", () => {
    expect(itemAtivo("/")?.href).toBe("/");
    expect(itemAtivo("/laboratorio")).toBeNull();
  });

  it("prefixo textual que não é segmento não casa", () => {
    expect(itemAtivo("/colecoesx")).toBeNull();
    expect(itemAtivo("/inventario-velho")).toBeNull();
  });
});

describe("abaAtiva", () => {
  it("uma aba cobre a área inteira", () => {
    expect(abaAtiva("/")).toBe("inicio");
    expect(abaAtiva("/colecoes/abc")).toBe("colecoes");
    expect(abaAtiva("/inventario/precos")).toBe("inventario");
    expect(abaAtiva("/inventario/visao-geral")).toBe("inventario");
  });

  it("o que não tem aba própria acende Mais", () => {
    expect(abaAtiva("/cadastro/set")).toBe("mais");
    expect(abaAtiva("/dex/caixas")).toBe("mais");
  });

  it("a busca acende o botão redondo, não uma aba", () => {
    expect(itemAtivo("/cadastro/busca")).toBe(ITEM_BUSCA);
    expect(abaAtiva("/cadastro/busca")).toBeNull();
  });

  it("fora do mapa, nenhuma", () => {
    expect(abaAtiva("/laboratorio")).toBeNull();
    expect(abaAtiva("/v1/colecoes")).toBeNull();
  });
});
