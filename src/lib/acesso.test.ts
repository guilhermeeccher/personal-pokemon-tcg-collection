import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* `cookies()`, `headers()` e `connection()` só existem dentro de uma
   requisição do Next. Aqui viram espiões: os testes do módulo desligado
   provam que cookie e cabeçalho nem são lidos, e que `connection()` é. */
const jarra = vi.hoisted(() => ({
  valor: undefined as string | undefined,
  cabecalhos: {} as Record<string, string>,
  cookies: 0,
  headers: 0,
  connection: 0,
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    jarra.cookies++;
    return { get: (nome: string) => (nome === "__Host-sessao" && jarra.valor ? { value: jarra.valor } : undefined) };
  },
  headers: async () => {
    jarra.headers++;
    return new Headers(jarra.cabecalhos);
  },
}));
vi.mock("next/server", () => ({
  connection: async () => {
    jarra.connection++;
  },
}));

import {
  comAcesso,
  configuracaoAcessoAtual,
  exigirSessao,
  exigirSessaoNaAcao,
  ipDoCliente,
  lerCookie,
  limiteLogin,
  rotaDoModulo,
} from "./acesso";
import { emitirSessao } from "./dominio/acesso/sessao";

const HASH = "scrypt:32768:8:1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA";
const SEGREDO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-_A";
const ORIGEM = "https://exemplo.test";

function ligar() {
  vi.stubEnv("ACESSO_COM_SENHA", "1");
  vi.stubEnv("SENHA_ACESSO_HASH", HASH);
  vi.stubEnv("SEGREDO_SESSAO", SEGREDO);
  vi.stubEnv("ORIGENS_PERMITIDAS", `${ORIGEM},http://127.0.0.1:3010`);
}

async function cookieValido(): Promise<string> {
  const c = configuracaoAcessoAtual();
  if (c.estado !== "ligada") throw new Error("configuração de teste inválida");
  return emitirSessao({ segredo: c.segredo, hashSenhaTexto: c.hashSenhaTexto, agoraMs: Date.now() });
}

function req(metodo: string, cabecalhos: Record<string, string> = {}, caminho = "/api/qualquer"): Request {
  return new Request(`https://exemplo.test${caminho}`, { method: metodo, headers: cabecalhos });
}

const respostaDoHandler = new Response("dados", { status: 200, headers: { "x-do-handler": "1" } });
const handler = vi.fn(async () => respostaDoHandler);

beforeEach(() => {
  vi.unstubAllEnvs();
  // Independente do ambiente de quem roda os testes.
  for (const v of ["ACESSO_COM_SENHA", "SENHA_ACESSO_HASH", "SEGREDO_SESSAO", "ORIGENS_PERMITIDAS"]) vi.stubEnv(v, "");
  handler.mockClear();
  jarra.valor = undefined;
  jarra.cabecalhos = {};
  jarra.cookies = 0;
  jarra.headers = 0;
  jarra.connection = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuracaoAcessoAtual", () => {
  it("relê o ambiente a cada chamada (nada preso)", () => {
    expect(configuracaoAcessoAtual().estado).toBe("desligado");
    ligar();
    expect(configuracaoAcessoAtual().estado).toBe("ligada");
    vi.stubEnv("SEGREDO_SESSAO", "curto");
    expect(configuracaoAcessoAtual().estado).toBe("invalida");
    vi.stubEnv("ACESSO_COM_SENHA", "0");
    expect(configuracaoAcessoAtual().estado).toBe("desligado");
  });
});

describe("comAcesso", () => {
  it("desligado: devolve a resposta do handler intocada, com os mesmos argumentos", async () => {
    const r = req("POST", { origin: "https://outro.test" });
    const ctx = { params: Promise.resolve({ id: "x" }) };
    const envolvido = comAcesso(handler);
    expect(await envolvido(r, ctx)).toBe(respostaDoHandler);
    expect(handler).toHaveBeenCalledWith(r, ctx);
  });

  it("ligado com configuração incompleta: 503", async () => {
    vi.stubEnv("ACESSO_COM_SENHA", "1");
    const resp = await comAcesso(handler)(req("GET"), {});
    expect(resp.status).toBe(503);
    expect(await resp.json()).toEqual({ erro: "configuracao_incompleta" });
    expect(resp.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  it("ligado sem sessão: 401", async () => {
    ligar();
    for (const cookie of [undefined, "__Host-sessao=lixo", "outro=1"]) {
      const resp = await comAcesso(handler)(req("GET", cookie ? { cookie } : {}), {});
      expect(resp.status).toBe(401);
      expect(await resp.json()).toEqual({ erro: "nao_autenticado" });
      expect(resp.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("ligado com sessão: GET passa, POST exige origem da lista", async () => {
    ligar();
    const cookie = `tema=x; __Host-sessao=${await cookieValido()}`;
    expect(await comAcesso(handler)(req("GET", { cookie }), {})).toBe(respostaDoHandler);
    expect(await comAcesso(handler)(req("POST", { cookie, origin: ORIGEM }), {})).toBe(respostaDoHandler);

    const recusada = await comAcesso(handler)(req("POST", { cookie, origin: "https://outro.test" }), {});
    expect(recusada.status).toBe(403);
    expect(await recusada.json()).toEqual({ erro: "origem_recusada" });
    expect(recusada.headers.get("cache-control")).toBe("private, no-store");

    expect((await comAcesso(handler)(req("DELETE", { cookie }), {})).status).toBe(403);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("rotaDoModulo", () => {
  it.each([
    ["POST", "/api/sessao"],
    ["DELETE", "/api/sessao"],
    ["GET", "/api/saude"],
    ["GET", "/pwa/icone-180.png"],
  ])("desligado: %s %s dá 404 sem corpo, sem chamar o handler", async (metodo, caminho) => {
    const resp = await rotaDoModulo(handler)(req(metodo, { origin: ORIGEM }, caminho), {});
    expect(resp.status).toBe(404);
    expect(await resp.text()).toBe("");
    expect(handler).not.toHaveBeenCalled();
  });

  it("ligado com configuração incompleta: 503", async () => {
    vi.stubEnv("ACESSO_COM_SENHA", "1");
    expect((await rotaDoModulo(handler)(req("GET", {}, "/api/saude"), {})).status).toBe(503);
  });

  it("POST /api/sessao é público com origem válida, e recusado com origem ruim", async () => {
    ligar();
    expect(await rotaDoModulo(handler)(req("POST", { origin: ORIGEM }, "/api/sessao"), {})).toBe(respostaDoHandler);
    expect((await rotaDoModulo(handler)(req("POST", { origin: "https://outro.test" }, "/api/sessao"), {})).status).toBe(
      403,
    );
    expect((await rotaDoModulo(handler)(req("POST", {}, "/api/sessao"), {})).status).toBe(403);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("GET de rota pública do módulo passa sem sessão", async () => {
    ligar();
    for (const caminho of ["/api/saude", "/robots.txt", "/manifest.webmanifest", "/pwa/icone-512.png"]) {
      expect(await rotaDoModulo(handler)(req("GET", {}, caminho), {})).toBe(respostaDoHandler);
    }
  });

  it("DELETE /api/sessao (sair) exige sessão, além da origem", async () => {
    ligar();
    const semSessao = await rotaDoModulo(handler)(req("DELETE", { origin: ORIGEM }, "/api/sessao"), {});
    expect(semSessao.status).toBe(401);
    expect(await semSessao.json()).toEqual({ erro: "nao_autenticado" });
    expect(semSessao.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();

    const cookie = `__Host-sessao=${await cookieValido()}`;
    expect(await rotaDoModulo(handler)(req("DELETE", { origin: ORIGEM, cookie }, "/api/sessao"), {})).toBe(
      respostaDoHandler,
    );
    expect((await rotaDoModulo(handler)(req("DELETE", { cookie }, "/api/sessao"), {})).status).toBe(403);
  });

  it.each([
    ["GET", "/pwa/qualquer-outro-nome"],
    ["GET", "/API/saude"],
    ["GET", "/api/saude/"],
    ["GET", "/api/sessao"],
    ["PUT", "/api/sessao"],
  ])("%s %s exige sessão", async (metodo, caminho) => {
    ligar();
    const resp = await rotaDoModulo(handler)(req(metodo, { origin: ORIGEM }, caminho), {});
    expect(resp.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("exigirSessao", () => {
  it("desligado: só chama connection(), sem tocar em cookies()", async () => {
    await expect(exigirSessao()).resolves.toBeUndefined();
    expect(jarra.connection).toBe(1);
    expect(jarra.cookies).toBe(0);
    expect(jarra.headers).toBe(0);
  });

  it("chama connection() antes de ler a flag, também ligado", async () => {
    ligar();
    jarra.valor = await cookieValido();
    await exigirSessao();
    expect(jarra.connection).toBe(1);
  });

  it("ligado sem sessão ou com configuração incompleta: redireciona para o login", async () => {
    ligar();
    await expect(exigirSessao()).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    vi.stubEnv("ORIGENS_PERMITIDAS", "");
    await expect(exigirSessao()).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("ligado com sessão: volta", async () => {
    ligar();
    jarra.valor = await cookieValido();
    await expect(exigirSessao()).resolves.toBeUndefined();
  });
});

describe("exigirSessaoNaAcao", () => {
  const recusa = (p: Promise<void>) => expect(p).rejects.toThrow(/^acesso recusado$/);

  it("desligado: só chama connection(), sem ler cookie nem cabeçalho", async () => {
    jarra.cabecalhos = { origin: "https://outro.test" };
    await expect(exigirSessaoNaAcao()).resolves.toBeUndefined();
    expect(jarra.connection).toBe(1);
    expect(jarra.cookies).toBe(0);
    expect(jarra.headers).toBe(0);
  });

  it("sessão válida e origem da lista: passa", async () => {
    ligar();
    jarra.valor = await cookieValido();
    jarra.cabecalhos = { origin: ORIGEM };
    await expect(exigirSessaoNaAcao()).resolves.toBeUndefined();
    expect(jarra.connection).toBe(1);
  });

  it("sessão válida e origem recusada: lança", async () => {
    ligar();
    jarra.valor = await cookieValido();
    jarra.cabecalhos = { origin: "https://outro.test", referer: `${ORIGEM}/` };
    await recusa(exigirSessaoNaAcao());
  });

  it("Origin `null`: lança, sem consultar o Referer", async () => {
    ligar();
    jarra.valor = await cookieValido();
    jarra.cabecalhos = { origin: "null", referer: `${ORIGEM}/colecoes` };
    await recusa(exigirSessaoNaAcao());
  });

  it("sem Origin, Referer da lista: passa", async () => {
    ligar();
    jarra.valor = await cookieValido();
    jarra.cabecalhos = { referer: `${ORIGEM}/colecoes?x=1` };
    await expect(exigirSessaoNaAcao()).resolves.toBeUndefined();
  });

  it("sem Origin e sem Referer: lança", async () => {
    ligar();
    jarra.valor = await cookieValido();
    await recusa(exigirSessaoNaAcao());
  });

  it("sem sessão, mesmo com origem boa: lança", async () => {
    ligar();
    jarra.cabecalhos = { origin: ORIGEM };
    await recusa(exigirSessaoNaAcao());
  });

  it("configuração incompleta: lança", async () => {
    vi.stubEnv("ACESSO_COM_SENHA", "1");
    jarra.cabecalhos = { origin: ORIGEM };
    await recusa(exigirSessaoNaAcao());
  });
});

describe("ipDoCliente", () => {
  const ip = (valor?: string) => ipDoCliente(new Headers(valor === undefined ? {} : { "cf-connecting-ip": valor }));

  it("IPv4 do túnel é o próprio endereço", () => {
    expect(ip("203.0.113.7")).toBe("203.0.113.7");
    expect(ip(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("IPv6 vira o prefixo /64", () => {
    expect(ip("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ip("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(ip("2001:DB8:0001:0002:ffff::1")).toBe("2001:db8:1:2::/64");
    expect(ip("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(ip("::1")).toBe("0:0:0:0::/64");
  });

  it("IPv4 mapeado em IPv6 é o IPv4", () => {
    expect(ip("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ip("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it.each([undefined, "", "lixo", "203.0.113.7, 198.51.100.1", "999.1.1.1", "exemplo.test"])(
    "sem cabeçalho ou sem cara de IP: local (%s)",
    (valor) => {
      expect(ip(valor)).toBe("local");
    },
  );
});

describe("lerCookie", () => {
  it("acha o cookie pelo nome exato, e na duplicata vale o primeiro", () => {
    const h = new Headers({ cookie: "x__Host-sessao=a; __Host-sessao=b; __Host-sessao=c" });
    expect(lerCookie(h, "__Host-sessao")).toBe("b");
    expect(lerCookie(new Headers(), "__Host-sessao")).toBeUndefined();
    expect(lerCookie(new Headers({ cookie: "outro=1" }), "__Host-sessao")).toBeUndefined();
  });
});

describe("limiteLogin", () => {
  it("é uma instância só por processo", async () => {
    vi.resetModules();
    const outraCarga = await import("./acesso");
    expect(outraCarga.limiteLogin).toBe(limiteLogin);
  });
});

/* ---------- tipos: o envoltório tem que caber no validador de rotas do Next ---------- */

/** Cópia do que `.next/types/validator.ts` exige de cada handler exportado. */
type HandlerDoNext<P> = (
  request: NextRequest,
  context: { params: Promise<P> },
) => Promise<Response | void> | Response | void;

describe("tipos de comAcesso", () => {
  it("encaixa nas assinaturas usadas em src/app/api", () => {
    const semArgumentos = comAcesso(async () => Response.json({}));
    const soRequest = comAcesso(async (r: Request) => Response.json({ m: r.method }));
    const comParams = comAcesso(async (_r: Request, { params }: { params: Promise<{ id: string }> }) =>
      Response.json(await params),
    );
    const comNextRequest = comAcesso(async (r: NextRequest) => Response.json({ p: r.nextUrl.pathname }));
    const sincrono = comAcesso(() => new Response(null, { status: 204 }));
    const modulo = rotaDoModulo(async (_r: Request, { params }: { params: Promise<{ arquivo: string }> }) =>
      Response.json(await params),
    );

    const a: HandlerDoNext<Record<string, never>> = semArgumentos;
    const b: HandlerDoNext<Record<string, never>> = soRequest;
    const c: HandlerDoNext<{ id: string }> = comParams;
    const d: HandlerDoNext<Record<string, never>> = comNextRequest;
    const e: HandlerDoNext<Record<string, never>> = sincrono;
    const f: HandlerDoNext<{ arquivo: string }> = modulo;
    expect([a, b, c, d, e, f].every((x) => typeof x === "function")).toBe(true);
  });
});
