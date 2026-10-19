import { describe, expect, it } from "vitest";

import nextConfig from "../../../../next.config";
import {
  CABECALHO_DESLIGADO,
  CAMINHOS_EXATOS_DO_MODULO,
  PASTA_INEXISTENTE,
  PREFIXOS_DO_MODULO,
  ehCaminhoDoModulo,
  reescritasDoModuloDesligado,
} from "./caminhos-modulo";
import { CAMINHOS_ROTAS_DO_MODULO, ICONES_PWA } from "./rotas-publicas";

/** `api/sessao/route.ts` → `/api/sessao`; `pwa/[arquivo]/route.ts` → `/pwa/[arquivo]`. */
function caminhoDaRota(arquivo: string): string {
  return "/" + arquivo.replace(/\/route\.ts$/, "");
}

describe("a lista bate com as rotas do módulo", () => {
  it("toda rota de CAMINHOS_ROTAS_DO_MODULO está aqui, exata ou por prefixo", () => {
    for (const arquivo of CAMINHOS_ROTAS_DO_MODULO) {
      const caminho = caminhoDaRota(arquivo);
      const dinamico = caminho.indexOf("/[");
      if (dinamico === -1) {
        expect(CAMINHOS_EXATOS_DO_MODULO as readonly string[], arquivo).toContain(caminho);
      } else {
        expect(PREFIXOS_DO_MODULO as readonly string[], arquivo).toContain(caminho.slice(0, dinamico));
      }
    }
  });

  it("e nada além delas e do login", () => {
    const rotas = CAMINHOS_ROTAS_DO_MODULO.map(caminhoDaRota);
    for (const exato of CAMINHOS_EXATOS_DO_MODULO) {
      expect(exato === "/login" || rotas.includes(exato), exato).toBe(true);
    }
    for (const prefixo of PREFIXOS_DO_MODULO) {
      expect(rotas.some((r) => r.startsWith(prefixo + "/[")), prefixo).toBe(true);
    }
  });
});

describe("ehCaminhoDoModulo", () => {
  it("pega o login, as rotas e todo ícone do PWA", () => {
    for (const caminho of [...CAMINHOS_EXATOS_DO_MODULO, "/pwa", "/pwa/qualquer", "/pwa/a/b"]) {
      expect(ehCaminhoDoModulo(caminho), caminho).toBe(true);
    }
    for (const icone of ICONES_PWA) expect(ehCaminhoDoModulo(`/pwa/${icone}`)).toBe(true);
  });

  it("compara exato, como a reescrita: vizinhos e outras grafias ficam de fora", () => {
    for (const caminho of [
      "/",
      "/colecoes",
      "/api/sets",
      "/api/cartas",
      "/api",
      "/api/sessao2",
      "/logins",
      "/LOGIN",
      "/login/",
      "/pwas",
      "/favicon.ico",
      "/dex/login",
      "/_next/static/x.js",
      PASTA_INEXISTENTE,
    ]) {
      expect(ehCaminhoDoModulo(caminho), caminho).toBe(false);
    }
  });
});

describe("reescritasDoModuloDesligado", () => {
  it("uma regra por caminho, todas exigindo o marcador com valor fixo", () => {
    const regras = reescritasDoModuloDesligado();
    expect(regras.map((r) => r.source)).toEqual([...CAMINHOS_EXATOS_DO_MODULO, "/pwa/:caminho*"]);
    for (const r of regras) {
      expect(r.has).toEqual([{ type: "header", key: CABECALHO_DESLIGADO, value: "1" }]);
      expect(r.destination.startsWith(PASTA_INEXISTENTE + "/")).toBe(true);
    }
  });

  it("o destino é uma pasta privada do App Router (nunca roteia)", () => {
    expect(PASTA_INEXISTENTE).toMatch(/^\/_[a-z-]+$/);
  });

  it("o next.config.ts usa exatamente estas regras, e nenhuma outra reescrita", async () => {
    const { rewrites } = nextConfig;
    expect(rewrites).toBeTypeOf("function");
    expect(await rewrites?.()).toEqual({
      beforeFiles: reescritasDoModuloDesligado(),
      afterFiles: [],
      fallback: [],
    });
  });
});
