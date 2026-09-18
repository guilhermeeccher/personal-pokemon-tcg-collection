import { describe, expect, it } from "vitest";

import {
  idiomaSuportado,
  lerUrlMypcards,
  urlImagemMypcards,
  validarLinkMapeamentoSet,
} from "./mypcards";

// A URL colhida em 2026-08-29, verbatim — é dela que todo
// o formato foi derivado, então é ela que ancora os testes.
const URL_REDIMENSIONADA =
  "https://img.mypcards.com/cdn-cgi/image/h=425,fit=contain,f=auto/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg";
const URL_ORIGINAL =
  "https://img.mypcards.com/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg";

describe("lerUrlMypcards", () => {
  it("lê a URL redimensionada — a forma que aparece no site", () => {
    expect(lerUrlMypcards(URL_REDIMENSIONADA)).toEqual({
      numeroSet: 2370,
      setId: "mee",
      localId: "004",
      idioma: "pt",
    });
  });

  it("lê também a URL original, sem o prefixo do redimensionador", () => {
    expect(lerUrlMypcards(URL_ORIGINAL)).toEqual({
      numeroSet: 2370,
      setId: "mee",
      localId: "004",
      idioma: "pt",
    });
  });

  it("preserva zeros à esquerda do número da carta", () => {
    // "004" nunca pode virar 4: o número entra na URL como está impresso.
    expect(lerUrlMypcards(URL_ORIGINAL)?.localId).toBe("004");
  });

  it("aceita código de set com ponto", () => {
    // `swsh4.5sv` é um dos 15 sets do buraco — se o parser cortasse por
    // split simples, o ponto ou o dígito quebrariam a leitura.
    const url =
      "https://img.mypcards.com/img/2/1234/pokemon_swsh4.5sv_SV001/pokemon_swsh4.5sv_SV001_pt.jpg";
    expect(lerUrlMypcards(url)).toEqual({
      numeroSet: 1234,
      setId: "swsh4.5sv",
      localId: "SV001",
      idioma: "pt",
    });
  });

  it("lê inglês", () => {
    expect(lerUrlMypcards(URL_ORIGINAL.replace("_pt.", "_en."))?.idioma).toBe("en");
  });

  it("recusa o que não é do formato", () => {
    expect(lerUrlMypcards("https://assets.tcgdex.net/pt/me/mee/004/low.webp")).toBeNull();
    expect(lerUrlMypcards("https://img.mypcards.com/img/2/2370/qualquer.jpg")).toBeNull();
    expect(lerUrlMypcards("não é url")).toBeNull();
    expect(lerUrlMypcards("")).toBeNull();
  });

  it("recusa host parecido — o domínio é comparado inteiro", () => {
    expect(
      lerUrlMypcards(
        "https://img.mypcards.com.exemplo.net/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg",
      ),
    ).toBeNull();
  });

  it("recusa idioma que o site não publica", () => {
    // `_jp` dá 404 lá (conferido no set mee). Ler como válido geraria uma
    // requisição perdida por carta japonesa.
    expect(lerUrlMypcards(URL_ORIGINAL.replace("_pt.", "_jp."))).toBeNull();
  });

  it("recusa número de set não numérico", () => {
    expect(
      lerUrlMypcards("https://img.mypcards.com/img/2/abc/pokemon_mee_004/pokemon_mee_004_pt.jpg"),
    ).toBeNull();
  });
});

describe("urlImagemMypcards", () => {
  it("monta a URL redimensionada de volta", () => {
    expect(
      urlImagemMypcards({ numeroSet: 2370, setId: "mee", localId: "004", idioma: "pt" }),
    ).toBe(URL_REDIMENSIONADA);
  });

  it("ida e volta: o que foi lido monta a mesma URL", () => {
    const lido = lerUrlMypcards(URL_REDIMENSIONADA);
    expect(lido).not.toBeNull();
    expect(urlImagemMypcards(lido!)).toBe(URL_REDIMENSIONADA);
  });

  it("preserva a caixa do número da carta", () => {
    expect(
      urlImagemMypcards({ numeroSet: 1, setId: "smp", localId: "SM84", idioma: "en" }),
    ).toContain("pokemon_smp_SM84_en.jpg");
  });
});

describe("idiomaSuportado", () => {
  it("aceita pt e en, recusa jp", () => {
    expect(idiomaSuportado("pt")).toBe(true);
    expect(idiomaSuportado("en")).toBe(true);
    expect(idiomaSuportado("jp")).toBe(false);
  });
});

describe("validarLinkMapeamentoSet", () => {
  it("aceita o link do set esperado", () => {
    const r = validarLinkMapeamentoSet(URL_REDIMENSIONADA, "mee");
    expect(r.ok).toBe(true);
    expect(r.ok && r.referencia.numeroSet).toBe(2370);
  });

  it("tolera espaço em volta do que foi colado", () => {
    expect(validarLinkMapeamentoSet(`  ${URL_ORIGINAL}\n`, "mee").ok).toBe(true);
  });

  it("recusa link de OUTRO set, dizendo qual veio", () => {
    // Sem esta guarda, o número errado é gravado e o sintoma aparece só
    // depois, como "o set inteiro ficou sem foto".
    const r = validarLinkMapeamentoSet(URL_ORIGINAL, "mep");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("mee");
  });

  it("recusa o que não é link do mypcards", () => {
    expect(validarLinkMapeamentoSet("https://exemplo.net/foto.jpg", "mee").ok).toBe(false);
  });
});
