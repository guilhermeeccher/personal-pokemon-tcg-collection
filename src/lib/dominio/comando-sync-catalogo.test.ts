import { describe, expect, it } from "vitest";

import { lerArgumentosSyncCatalogo } from "./comando-sync-catalogo";

describe("lerArgumentosSyncCatalogo", () => {
  it("sem argumento: os três idiomas, incremental", () => {
    expect(lerArgumentosSyncCatalogo([])).toEqual({
      ok: true,
      args: { idiomas: ["pt", "en", "jp"], profundo: false, ajuda: false },
    });
  });

  it("lê --idioma nas duas formas, com --profundo, e ignora um -- solto", () => {
    expect(lerArgumentosSyncCatalogo(["--", "--idioma", "pt,en", "--profundo"])).toEqual({
      ok: true,
      args: { idiomas: ["pt", "en"], profundo: true, ajuda: false },
    });
    expect(lerArgumentosSyncCatalogo(["--idioma=jp"])).toMatchObject({ ok: true, args: { idiomas: ["jp"] } });
    expect(lerArgumentosSyncCatalogo(["-h"])).toMatchObject({ ok: true, args: { ajuda: true } });
  });

  it("devolve a ordem canônica, sem repetição, e tolera espaço em volta", () => {
    expect(lerArgumentosSyncCatalogo(["--idioma", "en, pt,en"])).toMatchObject({
      ok: true,
      args: { idiomas: ["pt", "en"] },
    });
  });

  it("recusa idioma desconhecido — inclusive ja, o código da URL", () => {
    const r = lerArgumentosSyncCatalogo(["--idioma", "pt,ja"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('"ja"');
    expect(lerArgumentosSyncCatalogo(["--idioma", "pt,"]).ok).toBe(false);
    expect(lerArgumentosSyncCatalogo(["--idioma="]).ok).toBe(false);
  });

  it("recusa --idioma sem valor, ou seguido de outra opção", () => {
    expect(lerArgumentosSyncCatalogo(["--idioma"]).ok).toBe(false);
    expect(lerArgumentosSyncCatalogo(["--idioma", "--profundo"]).ok).toBe(false);
  });

  it("recusa --idioma repetido em vez de escolher um dos dois", () => {
    expect(lerArgumentosSyncCatalogo(["--idioma", "pt", "--idioma", "en"]).ok).toBe(false);
  });

  it("recusa argumento desconhecido: um --idioma digitado errado não pode cair nos três idiomas", () => {
    const r = lerArgumentosSyncCatalogo(["--idoma", "pt,en"]);
    expect(r).toEqual({ ok: false, erro: 'unknown argument "--idoma".' });
  });
});
