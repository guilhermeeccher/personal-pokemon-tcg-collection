import { describe, expect, it } from "vitest";

import {
  lerArgumentosVerificarImagens,
  urlBaseParaVerificar,
  vereditoDoErro,
  vereditoDoStatus,
  type LinhaVerificavel,
} from "./comando-verificar-imagens-cdn";

describe("lerArgumentosVerificarImagens", () => {
  it("sem argumento: o modo padrão, sem filtro nem limite", () => {
    expect(lerArgumentosVerificarImagens([])).toEqual({
      ok: true,
      args: { comUrl: false, reverificar: false, ajuda: false },
    });
  });

  it("--com-url combina com --idioma, --set e --limite, nas duas formas, e ignora um -- solto", () => {
    expect(
      lerArgumentosVerificarImagens(["--", "--com-url", "--idioma", "pt", "--set=xx1", "--limite", "200"]),
    ).toEqual({
      ok: true,
      args: { comUrl: true, reverificar: false, idioma: "pt", setId: "xx1", limite: 200, ajuda: false },
    });
    expect(lerArgumentosVerificarImagens(["--idioma=jp", "--set", "XX2a"])).toEqual({
      ok: true,
      args: { comUrl: false, reverificar: false, idioma: "jp", setId: "XX2a", ajuda: false },
    });
    expect(lerArgumentosVerificarImagens(["-h"])).toMatchObject({ ok: true, args: { ajuda: true } });
  });

  it("--reverificar combina com --com-url, --set e --idioma, e não aceita valor nem repetição", () => {
    expect(lerArgumentosVerificarImagens(["--reverificar", "--com-url", "--set", "xx1", "--idioma", "en"])).toEqual({
      ok: true,
      args: { comUrl: true, reverificar: true, idioma: "en", setId: "xx1", ajuda: false },
    });
    expect(lerArgumentosVerificarImagens(["--reverificar=sim"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--reverificar", "--reverificar"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--reverifica"]).ok).toBe(false);
  });

  it("recusa argumento desconhecido: um --com-url digitado errado não cai no modo padrão", () => {
    expect(lerArgumentosVerificarImagens(["--com-ur"])).toEqual({
      ok: false,
      erro: 'unknown argument "--com-ur".',
    });
    expect(lerArgumentosVerificarImagens(["--idoma", "jp"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["pt"]).ok).toBe(false);
  });

  it("recusa idioma fora do enum do banco — inclusive ja, o código da URL", () => {
    const r = lerArgumentosVerificarImagens(["--idioma", "ja"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('"ja"');
    expect(lerArgumentosVerificarImagens(["--idioma", "pt,en"]).ok).toBe(false);
  });

  it("recusa opção sem valor, seguida de outra opção, ou repetida", () => {
    expect(lerArgumentosVerificarImagens(["--set"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--set="]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--idioma", "--com-url"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--set", "a", "--set", "b"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--com-url", "--com-url"]).ok).toBe(false);
    expect(lerArgumentosVerificarImagens(["--com-url=sim"]).ok).toBe(false);
  });

  it("recusa --limite que não seja inteiro positivo, em vez de rodar sem limite", () => {
    for (const v of ["abc", "0", "-5", "1.5", "10x"]) {
      expect(lerArgumentosVerificarImagens(["--limite", v]).ok).toBe(false);
    }
  });
});

describe("urlBaseParaVerificar", () => {
  const semUrl: LinhaVerificavel = {
    idioma: "jp",
    imagemUrl: null,
    setSerieId: "XX",
    setId: "XX1H",
    localId: "009",
  };
  const comUrl: LinhaVerificavel = {
    idioma: "pt",
    imagemUrl: "https://assets.tcgdex.net/pt/xx/xx1/001",
    setSerieId: "xx",
    setId: "xx1",
    localId: "001",
  };

  it("modo padrão: a URL deduzida, só para linha sem imagem_url", () => {
    expect(urlBaseParaVerificar(semUrl, false)).toBe("https://assets.tcgdex.net/ja/XX/XX1H/009");
    expect(urlBaseParaVerificar(comUrl, false)).toBeNull();
    expect(urlBaseParaVerificar({ ...semUrl, setSerieId: null }, false)).toBeNull();
  });

  it("--com-url: a própria URL gravada, só no host do CDN", () => {
    expect(urlBaseParaVerificar(comUrl, true)).toBe("https://assets.tcgdex.net/pt/xx/xx1/001");
    expect(urlBaseParaVerificar(semUrl, true)).toBeNull();
    expect(urlBaseParaVerificar({ ...comUrl, imagemUrl: "https://exemplo.invalid/x" }, true)).toBeNull();
    expect(urlBaseParaVerificar({ ...comUrl, imagemUrl: "/api/imagens-locais/x/pt" }, true)).toBeNull();
  });
});

describe("vereditoDoStatus / vereditoDoErro", () => {
  it("2xx existe; 404 e 504 (o CDN de 2026-08-29) são ausência", () => {
    expect(vereditoDoStatus(200)).toBe("existe");
    expect(vereditoDoStatus(404)).toBe("ausente");
    expect(vereditoDoStatus(504)).toBe("ausente");
  });

  it("403 e 429 são bloqueio — não dizem nada sobre o arquivo", () => {
    expect(vereditoDoStatus(403)).toBe("bloqueio");
    expect(vereditoDoStatus(429)).toBe("bloqueio");
  });

  it("redirecionamento, outro 5xx ou outro 4xx não decidem nada", () => {
    for (const s of [301, 302, 500, 502, 503, 400, 410]) expect(vereditoDoStatus(s)).toBe("indefinido");
  });

  it("timeout nosso é ausência; conexão recusada ou derrubada é bloqueio; o resto, indefinido", () => {
    expect(vereditoDoErro(new DOMException("t", "TimeoutError"))).toBe("ausente");
    const recusada = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const derrubada = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    expect(vereditoDoErro(recusada)).toBe("bloqueio");
    expect(vereditoDoErro(derrubada)).toBe("bloqueio");
    expect(vereditoDoErro(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }))).toBe(
      "indefinido",
    );
    expect(vereditoDoErro(new Error("x"))).toBe("indefinido");
  });
});
