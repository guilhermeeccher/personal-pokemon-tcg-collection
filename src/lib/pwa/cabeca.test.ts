import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SCRIPT_BFCACHE, atributosHtmlPwa, metadadosPwa, viewportPwa, viewportV2 } from "./cabeca";
import { COR_FUNDO, COR_TEMA, NOME_CURTO_APP } from "./identidade";

describe("cabeça do PWA, compartilhada pelos dois layouts raiz", () => {
  it("desligado: nada no <head>, viewport padrão e nenhum atributo", () => {
    expect(metadadosPwa(false)).toEqual({});
    expect(viewportPwa(false)).toEqual({});
    expect(atributosHtmlPwa(false)).toEqual({});
    expect("data-pwa" in atributosHtmlPwa(false)).toBe(false);
  });

  it("ligado: manifesto, metadados Apple, ícone e viewport-fit", () => {
    expect(metadadosPwa(true)).toEqual({
      manifest: "/manifest.webmanifest",
      appleWebApp: { capable: true, title: NOME_CURTO_APP, statusBarStyle: "default" },
      icons: { apple: [{ url: "/pwa/icone-180.png", sizes: "180x180", type: "image/png" }] },
    });
    expect(viewportPwa(true)).toEqual({ viewportFit: "cover" });
    expect(atributosHtmlPwa(true)).toEqual({ "data-pwa": "" });
  });

  it("a v2 usa a barra de status translúcida; o resto do PWA é o mesmo", () => {
    expect(metadadosPwa(false, "v2")).toEqual({});
    expect(metadadosPwa(true, "v2")).toEqual({
      ...metadadosPwa(true, "v1"),
      appleWebApp: { capable: true, title: NOME_CURTO_APP, statusBarStyle: "black-translucent" },
    });
  });

  it("a v2 cobre a tela sempre, escura, com ou sem o módulo", () => {
    expect(viewportV2()).toEqual({ viewportFit: "cover", themeColor: COR_TEMA, colorScheme: "dark" });
  });

  it("as cores do app instalado são o fundo escuro da v2", () => {
    const fundoV2 = /--v2-fundo:\s*(#[0-9a-f]{6})/i.exec(
      readFileSync(path.resolve(__dirname, "../../app/(v2)/v2.css"), "utf8"),
    )?.[1];
    expect(fundoV2?.toLowerCase()).toBe(COR_FUNDO.toLowerCase());
    expect(COR_TEMA).toBe(COR_FUNDO);
  });

  it("o script do bfcache recarrega só a página restaurada do cache", () => {
    expect(SCRIPT_BFCACHE).toContain('"pageshow"');
    expect(SCRIPT_BFCACHE).toContain("e.persisted");
    expect(SCRIPT_BFCACHE).toContain("location.reload()");
  });
});
