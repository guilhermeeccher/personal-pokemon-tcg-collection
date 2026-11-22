import { describe, expect, it } from "vitest";

import { SCRIPT_BFCACHE, atributosHtmlPwa, metadadosPwa, viewportPwa } from "./cabeca";
import { NOME_CURTO_APP } from "./identidade";

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

  it("o script do bfcache recarrega só a página restaurada do cache", () => {
    expect(SCRIPT_BFCACHE).toContain('"pageshow"');
    expect(SCRIPT_BFCACHE).toContain("e.persisted");
    expect(SCRIPT_BFCACHE).toContain("location.reload()");
  });
});
