import { describe, expect, it } from "vitest";

import { ITEM_BUSCA, abaAtiva, abasDaBarra, gruposDaNav, itemAtivo } from "./mapa-navegacao";

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

  it.each([true, false])("livingDex=%s: toda aba aponta para um item do mapa da mesma configuração", (dex) => {
    const itens = gruposDaNav(dex).flatMap((g) => g.itens);
    for (const { item } of abasDaBarra(dex)) expect(itens).toContain(item);
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

describe("abasDaBarra", () => {
  it("com a Living Dex ligada: cinco posições, a Dex antes de Mais", () => {
    // "Mais" não é aba com destino: a casca a desenha sempre, depois destas.
    expect(abasDaBarra(true).map((a) => a.aba)).toEqual(["inicio", "colecoes", "inventario", "dex"]);
  });

  it("com o módulo desligado: quatro, sem a Dex", () => {
    expect(abasDaBarra(false).map((a) => a.aba)).toEqual(["inicio", "colecoes", "inventario"]);
  });

  it("a aba da Dex leva à visão geral da Dex e se chama pelo módulo", () => {
    const dex = abasDaBarra(true).find((a) => a.aba === "dex")!;
    expect(dex.item.href).toBe("/dex");
    expect(dex.chaveRotulo).toBe("grupos.dex");
  });
});

describe("abaAtiva", () => {
  it("uma aba cobre a área inteira", () => {
    expect(abaAtiva("/", false)).toBe("inicio");
    expect(abaAtiva("/colecoes/abc", false)).toBe("colecoes");
    expect(abaAtiva("/inventario/precos", false)).toBe("inventario");
    expect(abaAtiva("/inventario/visao-geral", false)).toBe("inventario");
  });

  it("o que não tem aba própria acende Mais", () => {
    expect(abaAtiva("/cadastro/set", false)).toBe("mais");
    expect(abaAtiva("/cadastro/set", true)).toBe("mais");
    // Desligada, a Dex não tem aba (lá dá 404, e nada chega a acender).
    expect(abaAtiva("/dex/caixas", false)).toBe("mais");
  });

  it("com a Living Dex ligada, a aba da Dex cobre toda a área /dex", () => {
    expect(abaAtiva("/dex", true)).toBe("dex");
    expect(abaAtiva("/dex/caixas", true)).toBe("dex");
    expect(abaAtiva("/dex/planos", true)).toBe("dex");
    expect(abaAtiva("/dexter", true)).toBeNull();
  });

  it("as abas do TCG acendem igual nas duas configurações", () => {
    for (const caminho of ["/", "/colecoes/x", "/inventario/precos", "/cadastro/busca", "/laboratorio"]) {
      expect(abaAtiva(caminho, true)).toBe(abaAtiva(caminho, false));
    }
  });

  it("a busca acende o botão redondo, não uma aba", () => {
    expect(itemAtivo("/cadastro/busca")).toBe(ITEM_BUSCA);
    expect(abaAtiva("/cadastro/busca", false)).toBeNull();
  });

  it("fora do mapa, nenhuma", () => {
    expect(abaAtiva("/laboratorio", false)).toBeNull();
    expect(abaAtiva("/v1/colecoes", false)).toBeNull();
  });
});
