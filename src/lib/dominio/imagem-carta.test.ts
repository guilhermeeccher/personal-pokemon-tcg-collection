import { describe, expect, it } from "vitest";

import { urlBaseImagemCartaCdn } from "./imagem-carta";

describe("urlBaseImagemCartaCdn", () => {
  it("monta a URL base a partir de idioma, série, set e localId", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "me",
        setId: "mep",
        localId: "001",
      }),
    ).toBe("https://assets.tcgdex.net/en/me/mep/001");
  });

  it("preserva zeros à esquerda do localId", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "pt",
        setSerieId: "sm",
        setId: "sm3h",
        localId: "009",
      }),
    ).toContain("/009");

    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "swsh",
        setId: "swsh12",
        localId: "SWSH032",
      }),
    ).toContain("/SWSH032");
  });

  it("nunca normaliza caixa: catálogo japonês usa serie/set em maiúsculas", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "jp",
        setSerieId: "SM",
        setId: "SM3H",
        localId: "009",
      }),
    ).toBe("https://assets.tcgdex.net/ja/SM/SM3H/009");
  });

  it("não mexe na caixa do catálogo ocidental (minúsculas)", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "sv",
        setId: "sv03.5",
        localId: "025",
      }),
    ).toBe("https://assets.tcgdex.net/en/sv/sv03.5/025");
  });

  it("traduz o idioma jp para o código ISO ja no path (regra do host de CDN, igual à API)", () => {
    const url = urlBaseImagemCartaCdn({
      idioma: "jp",
      setSerieId: "SM",
      setId: "SM3H",
      localId: "009",
    });
    expect(url).toMatch(/^https:\/\/assets\.tcgdex\.net\/ja\//);
    expect(url).not.toContain("/jp/");
  });

  it("pt e en passam direto, sem tradução", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "pt",
        setSerieId: "me",
        setId: "mep",
        localId: "079",
      }),
    ).toBe("https://assets.tcgdex.net/pt/me/mep/079");
  });

  it("devolve null sem id de série", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: null,
        setId: "mep",
        localId: "001",
      }),
    ).toBeNull();

    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: undefined,
        setId: "mep",
        localId: "001",
      }),
    ).toBeNull();
  });

  it("devolve null sem id de set", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "me",
        setId: null,
        localId: "001",
      }),
    ).toBeNull();
  });

  it("devolve null sem localId", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "me",
        setId: "mep",
        localId: undefined,
      }),
    ).toBeNull();
  });

  it("devolve null sem idioma", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: null,
        setSerieId: "me",
        setId: "mep",
        localId: "001",
      }),
    ).toBeNull();
  });

  it("devolve null com string vazia em qualquer parte (não monta URL quebrada)", () => {
    expect(
      urlBaseImagemCartaCdn({
        idioma: "en",
        setSerieId: "",
        setId: "mep",
        localId: "001",
      }),
    ).toBeNull();
  });
});
