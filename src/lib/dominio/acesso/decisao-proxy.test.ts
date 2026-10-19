import { describe, expect, it, vi } from "vitest";

import { CABECALHO_DESLIGADO } from "./caminhos-modulo";
import { lerConfiguracaoAcesso, type ConfiguracaoAcesso } from "./configuracao";
import {
  CABECALHOS_SEGURANCA,
  CACHE_PRIVADO,
  aplicarCabecalhosSeguranca,
  cabecalhosInternos,
  decidirProxy,
  destinoLogin,
  esperaJson,
  urlDoOtimizadorAceita,
  type RequisicaoProxy,
} from "./decisao-proxy";

const ORIGEM = "https://exemplo.test";

const LIGADA = lerConfiguracaoAcesso({
  ACESSO_COM_SENHA: "1",
  SENHA_ACESSO_HASH: "scrypt:32768:8:1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA",
  SEGREDO_SESSAO: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-_A",
  ORIGENS_PERMITIDAS: `${ORIGEM},http://127.0.0.1:3010`,
});
const DESLIGADA: ConfiguracaoAcesso = { estado: "desligado" };
const INVALIDA: ConfiguracaoAcesso = { estado: "invalida", motivos: ["SEGREDO_SESSAO ausente"] };

function req(
  metodo: string,
  caminhoComBusca: string,
  cabecalhos: Record<string, string> = {},
): RequisicaoProxy {
  const [caminho, ...resto] = caminhoComBusca.split("?");
  return {
    metodo,
    caminho,
    busca: resto.length > 0 ? `?${resto.join("?")}` : "",
    cabecalhos: new Headers(cabecalhos),
  };
}

const comSessao = () => Promise.resolve(true);
const semSessao = () => Promise.resolve(false);

describe("decidirProxy — desligado e configuração incompleta", () => {
  it("desligado não toca em nada fora do módulo, nem confere sessão", async () => {
    const sessao = vi.fn(semSessao);
    for (const r of [
      req("GET", "/"),
      req("GET", "/colecoes"),
      req("POST", "/api/copias", { origin: "https://malicioso.test" }),
      req("GET", "/api/copias", { "x-middleware-subrequest": "proxy" }),
      req("GET", "/favicon.ico"),
      req("GET", "/loginx"),
      req("GET", "/api/sessaox"),
      req("GET", "/pwax/icone-192.png"),
    ]) {
      expect(await decidirProxy(r, DESLIGADA, sessao)).toEqual({ tipo: "intocada" });
    }
    expect(sessao).not.toHaveBeenCalled();
  });

  it("desligado, os caminhos do módulo viram inexistentes em qualquer método", async () => {
    const sessao = vi.fn(comSessao);
    for (const caminho of [
      "/login",
      "/api/sessao",
      "/api/saude",
      "/robots.txt",
      "/manifest.webmanifest",
      "/pwa/icone-192.png",
      "/pwa/qualquer",
    ]) {
      for (const metodo of ["GET", "HEAD", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"]) {
        expect(await decidirProxy(req(metodo, caminho), DESLIGADA, sessao), `${metodo} ${caminho}`).toEqual({
          tipo: "inexistente",
        });
      }
    }
    expect(sessao).not.toHaveBeenCalled();
  });

  it("configuração incompleta é 503 em tudo, inclusive nas públicas", async () => {
    const sessao = vi.fn(comSessao);
    for (const r of [req("GET", "/"), req("GET", "/login"), req("GET", "/api/saude"), req("POST", "/api/sessao")]) {
      expect(await decidirProxy(r, INVALIDA, sessao)).toEqual({ tipo: "configuracao_invalida" });
    }
    expect(sessao).not.toHaveBeenCalled();
  });
});

describe("decidirProxy — origem", () => {
  it("recusa com 403 método que altera dados vindo de fora, antes até da lista pública", async () => {
    const sessao = vi.fn(comSessao);
    expect(await decidirProxy(req("POST", "/api/sessao", { origin: "https://malicioso.test" }), LIGADA, sessao)).toEqual({
      tipo: "recusar",
      status: 403,
      codigo: "origem_recusada",
    });
    expect((await decidirProxy(req("DELETE", "/api/copias/1"), LIGADA, sessao)).tipo).toBe("recusar");
    expect(await decidirProxy(req("PATCH", "/api/copias/1", { origin: "null" }), LIGADA, sessao)).toMatchObject({
      status: 403,
    });
    expect(sessao).not.toHaveBeenCalled();
  });

  it("aceita origem da lista, e o Referer na falta do Origin", async () => {
    expect(await decidirProxy(req("POST", "/api/sessao", { origin: ORIGEM }), LIGADA, semSessao)).toMatchObject({
      tipo: "seguir",
    });
    expect(
      await decidirProxy(req("POST", "/api/copias", { referer: `${ORIGEM}/inventario` }), LIGADA, comSessao),
    ).toMatchObject({ tipo: "seguir" });
  });

  it("não confere origem em GET, HEAD e OPTIONS", async () => {
    for (const metodo of ["GET", "HEAD"]) {
      expect(
        await decidirProxy(req(metodo, "/colecoes", { origin: "https://malicioso.test" }), LIGADA, comSessao),
      ).toMatchObject({ tipo: "seguir" });
    }
    // OPTIONS passa pela origem, mas sem sessão é 401 (não é leitura).
    expect(await decidirProxy(req("OPTIONS", "/api/copias", { origin: "https://x.test" }), LIGADA, semSessao)).toEqual({
      tipo: "recusar",
      status: 401,
      codigo: "nao_autenticado",
    });
  });
});

describe("decidirProxy — rotas públicas", () => {
  it("segue sem consultar a sessão", async () => {
    const sessao = vi.fn(semSessao);
    for (const caminho of ["/login", "/api/saude", "/manifest.webmanifest", "/robots.txt", "/favicon.ico", "/pwa/icone-192.png"]) {
      for (const metodo of ["GET", "HEAD"]) {
        expect((await decidirProxy(req(metodo, caminho), LIGADA, sessao)).tipo).toBe("seguir");
      }
    }
    expect((await decidirProxy(req("POST", "/api/sessao", { origin: ORIGEM }), LIGADA, sessao)).tipo).toBe("seguir");
    expect(sessao).not.toHaveBeenCalled();
  });

  it("cache privado só no login e nas APIs públicas", async () => {
    const privada = async (r: RequisicaoProxy) => {
      const d = await decidirProxy(r, LIGADA, semSessao);
      if (d.tipo !== "seguir") throw new Error(`esperava seguir, veio ${d.tipo}`);
      return d.privada;
    };
    expect(await privada(req("GET", "/login"))).toBe(true);
    expect(await privada(req("GET", "/api/saude"))).toBe(true);
    expect(await privada(req("POST", "/api/sessao", { origin: ORIGEM }))).toBe(true);
    expect(await privada(req("GET", "/robots.txt"))).toBe(false);
    expect(await privada(req("GET", "/manifest.webmanifest"))).toBe(false);
    expect(await privada(req("GET", "/pwa/icone-512.png"))).toBe(false);
  });

  it("o que não é par público exato pede sessão", async () => {
    for (const r of [
      req("POST", "/login", { origin: ORIGEM }), // server action numa página pública
      req("DELETE", "/api/sessao", { origin: ORIGEM }), // sair
      req("GET", "/api/sessao"),
      req("GET", "/LOGIN"),
      req("GET", "/login/"),
      req("GET", "//login"),
      req("GET", "/pwa/outro.png"),
    ]) {
      expect((await decidirProxy(r, LIGADA, semSessao)).tipo).not.toBe("seguir");
    }
  });
});

describe("decidirProxy — sem sessão", () => {
  it("página vira 307 para o login, com o volta", async () => {
    expect(await decidirProxy(req("GET", "/colecoes/abc?aba=faltando"), LIGADA, semSessao)).toEqual({
      tipo: "redirecionar",
      destino: `/login?volta=${encodeURIComponent("/colecoes/abc?aba=faltando")}`,
    });
    expect(await decidirProxy(req("HEAD", "/inventario"), LIGADA, semSessao)).toEqual({
      tipo: "redirecionar",
      destino: "/login?volta=%2Finventario",
    });
    expect(
      await decidirProxy(req("GET", "/dex", { "sec-fetch-mode": "navigate" }), LIGADA, semSessao),
    ).toMatchObject({ tipo: "redirecionar" });
  });

  it("API, RSC, prefetch, fetch e método de escrita viram 401", async () => {
    const casos = [
      req("GET", "/api/copias"),
      req("GET", "/API//copias/"),
      req("GET", "/api"),
      req("GET", "/%2e%2e/x"),
      req("GET", "/colecoes", { rsc: "1" }),
      req("GET", "/colecoes", { "next-router-state-tree": "%5B%5D" }),
      req("GET", "/colecoes", { "next-router-prefetch": "1" }),
      req("GET", "/colecoes", { "next-router-segment-prefetch": "/_tree" }),
      req("GET", "/colecoes?_rsc=abc12"),
      req("GET", "/colecoes", { purpose: "prefetch" }),
      req("GET", "/colecoes", { "sec-purpose": "prefetch;prerender" }),
      req("GET", "/colecoes", { "sec-fetch-mode": "cors" }),
      req("GET", "/colecoes", { "sec-fetch-mode": "same-origin" }),
      req("GET", "/_next/image?url=https%3A%2F%2Fassets.tcgdex.net%2Fx%2Flow.webp&w=256&q=75", {
        "sec-fetch-mode": "no-cors",
      }),
      req("POST", "/colecoes", { origin: ORIGEM, "next-action": "abc" }),
      req("PUT", "/api/copias/1", { origin: ORIGEM }),
    ];
    for (const r of casos) {
      expect(await decidirProxy(r, LIGADA, semSessao), `${r.metodo} ${r.caminho}${r.busca}`).toEqual({
        tipo: "recusar",
        status: 401,
        codigo: "nao_autenticado",
      });
    }
  });

  it("sessão válida segue com cache privado", async () => {
    expect(await decidirProxy(req("GET", "/colecoes"), LIGADA, comSessao)).toEqual({
      tipo: "seguir",
      privada: true,
      remover: [],
    });
    expect(await decidirProxy(req("DELETE", "/api/sessao", { origin: ORIGEM }), LIGADA, comSessao)).toMatchObject({
      tipo: "seguir",
    });
  });
});

describe("decidirProxy — cabeçalhos internos do Next", () => {
  it("contam como sem sessão, mesmo com cookie válido, e nem consultam a sessão", async () => {
    const sessao = vi.fn(comSessao);
    expect(
      await decidirProxy(req("GET", "/api/copias", { "x-middleware-subrequest": "src/proxy" }), LIGADA, sessao),
    ).toEqual({ tipo: "recusar", status: 401, codigo: "nao_autenticado" });
    expect(await decidirProxy(req("GET", "/colecoes", { "x-nextjs-data": "1" }), LIGADA, sessao)).toMatchObject({
      tipo: "redirecionar",
    });
    expect(await decidirProxy(req("GET", "/colecoes", { "x-matched-path": "/x" }), LIGADA, sessao)).toMatchObject({
      tipo: "redirecionar",
    });
    expect(sessao).not.toHaveBeenCalled();
  });

  it("numa rota pública, seguem tirados da requisição", async () => {
    expect(
      await decidirProxy(
        req("GET", "/login", { "x-middleware-subrequest": "a", "X-Middleware-Rewrite": "/api/copias", "x-now-route-matches": "1" }),
        LIGADA,
        semSessao,
      ),
    ).toEqual({
      tipo: "seguir",
      privada: true,
      remover: ["x-middleware-rewrite", "x-middleware-subrequest", "x-now-route-matches"],
    });
  });

  it("os ids de depuração que o cliente do Next manda no dev não contam", () => {
    expect(
      cabecalhosInternos(
        new Headers({ "x-nextjs-request-id": "1a", "x-nextjs-html-request-id": "2b", "x-deployment-id": "d", rsc: "1" }),
      ),
    ).toEqual([]);
    expect(cabecalhosInternos(new Headers({ "x-nextjs-futuro": "1", "next-resume": "1" }))).toEqual([
      "next-resume",
      "x-nextjs-futuro",
    ]);
  });
});

describe("esperaJson", () => {
  it("navegação de página sem Sec-Fetch-Mode (curl, navegador antigo) é página", () => {
    expect(esperaJson(req("GET", "/colecoes"))).toBe(false);
    expect(esperaJson(req("GET", "/"))).toBe(false);
    expect(esperaJson(req("GET", "/apis"))).toBe(false); // não é `/api/`
  });
});

describe("destinoLogin", () => {
  it("leva o caminho com a query, codificado", () => {
    expect(destinoLogin({ caminho: "/dex/caixas", busca: "?caixa=3&trilha=shiny" })).toBe(
      "/login?volta=%2Fdex%2Fcaixas%3Fcaixa%3D3%26trilha%3Dshiny",
    );
  });

  it("raiz, login e o que não é seguro vão para /login sem volta", () => {
    expect(destinoLogin({ caminho: "/", busca: "" })).toBe("/login");
    expect(destinoLogin({ caminho: "/login", busca: "?volta=/x" })).toBe("/login");
    expect(destinoLogin({ caminho: "//malicioso.test", busca: "" })).toBe("/login");
    expect(destinoLogin({ caminho: "/a/../login", busca: "" })).toBe("/login");
    expect(destinoLogin({ caminho: "/" + "a".repeat(3000), busca: "" })).toBe("/login");
  });

  it("o volta montado sobrevive à ida e volta pelo URLSearchParams", () => {
    const destino = destinoLogin({ caminho: "/colecoes/1", busca: "?a=1&b=%2F" });
    expect(new URL(destino, "https://exemplo.test").searchParams.get("volta")).toBe("/colecoes/1?a=1&b=%2F");
  });
});

describe("aplicarCabecalhosSeguranca", () => {
  it("põe os cinco cabeçalhos, e o cache privado só quando pedido", () => {
    const publica = new Headers({ "Cache-Control": "public, max-age=60" });
    aplicarCabecalhosSeguranca(publica, false);
    for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) expect(publica.get(nome)).toBe(valor);
    expect(publica.get("cache-control")).toBe("public, max-age=60");

    const privada = new Headers({ "Cache-Control": "public, max-age=60" });
    aplicarCabecalhosSeguranca(privada, true);
    expect(privada.get("cache-control")).toBe(CACHE_PRIVADO);
    expect(privada.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(privada.get("content-security-policy")).toBe("frame-ancestors 'none'");
  });
});

describe("decidirProxy — o marcador do módulo desligado", () => {
  it("o marcador vindo de fora é cabeçalho interno: sem sessão, e tirado das públicas", async () => {
    expect(cabecalhosInternos(new Headers({ [CABECALHO_DESLIGADO]: "1" }))).toEqual([CABECALHO_DESLIGADO]);
    expect(await decidirProxy(req("GET", "/api/sets", { [CABECALHO_DESLIGADO]: "1" }), LIGADA, comSessao)).toEqual({
      tipo: "recusar",
      status: 401,
      codigo: "nao_autenticado",
    });
    expect(await decidirProxy(req("GET", "/login", { [CABECALHO_DESLIGADO]: "1" }), LIGADA, semSessao)).toEqual({
      tipo: "seguir",
      privada: true,
      remover: [CABECALHO_DESLIGADO],
    });
  });
});

describe("decidirProxy — /_next/image com o módulo ligado", () => {
  const remota = "url=" + encodeURIComponent("https://assets.tcgdex.net/pt/swsh/swsh1/1/low.webp") + "&w=256&q=75";

  it("URL que não é remota https: é 400, com ou sem sessão, e nem consulta a sessão", async () => {
    const valida = vi.fn(comSessao);
    const ausente = vi.fn(semSessao);
    for (const busca of [
      "?url=%2Fapi%2Fimagens-locais%2Fabc%2Fpt&w=256&q=75", // local
      "?url=%2F%2Fexemplo.test%2Fx.png&w=256&q=75", // //host
      "?url=http%3A%2F%2Fassets.tcgdex.net%2Fx.webp&w=256&q=75", // http:
      "?w=256&q=75", // ausente
      "?url=",
      `?${remota}&url=%2Fapi%2Fimagens-locais%2Fabc%2Fpt`, // repetida
      `?${remota}&url=https%3A%2F%2Fassets.tcgdex.net%2Fy.webp`, // repetida, as duas remotas
      "?url=%20https%3A%2F%2Fassets.tcgdex.net%2Fx.webp", // espaço na frente
      "?url=https%3A%2F%2Fassets.tcgdex.net%2Fa%20b.webp", // espaço no meio
      "?url=https%3A%2F%2Fassets.tcgdex.net%2Fa%09b.webp", // tab no meio
      "?url=https%3Aassets.tcgdex.net", // sem as barras
      "?url=data%3Aimage%2Fpng%3Bbase64%2CAAAA",
    ]) {
      for (const s of [valida, ausente]) {
        expect(await decidirProxy(req("GET", "/_next/image" + busca), LIGADA, s), busca).toEqual({
          tipo: "imagem_recusada",
        });
      }
    }
    expect(valida).not.toHaveBeenCalled();
    expect(ausente).not.toHaveBeenCalled();
  });

  it("https: absoluta segue para a sessão de sempre", async () => {
    expect(await decidirProxy(req("GET", `/_next/image?${remota}`), LIGADA, comSessao)).toEqual({
      tipo: "seguir",
      privada: true,
      remover: [],
    });
    expect(
      await decidirProxy(req("GET", `/_next/image?${remota}`, { "sec-fetch-mode": "no-cors" }), LIGADA, semSessao),
    ).toEqual({ tipo: "recusar", status: 401, codigo: "nao_autenticado" });
  });

  it("desligado: intocado, qualquer url", async () => {
    const local = req("GET", "/_next/image?url=%2Fapi%2Fimagens-locais%2Fabc%2Fpt&w=256");
    expect(await decidirProxy(local, DESLIGADA, comSessao)).toEqual({ tipo: "intocada" });
  });

  it("urlDoOtimizadorAceita", () => {
    expect(urlDoOtimizadorAceita(`?${remota}`)).toBe(true);
    expect(urlDoOtimizadorAceita("?url=%2Fx")).toBe(false);
    expect(urlDoOtimizadorAceita("")).toBe(false);
  });
});
