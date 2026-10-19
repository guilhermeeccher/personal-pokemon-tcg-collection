import { describe, expect, it } from "vitest";

import { CAMINHOS_ROTAS_DO_MODULO, ehRotaPublica, ICONES_PWA, normalizarCaminho } from "./rotas-publicas";

describe("normalizarCaminho", () => {
  it.each([
    ["/", "/"],
    ["/login", "/login"],
    ["/API/copias", "/api/copias"],
    ["/api//copias", "/api/copias"],
    ["/api/copias/", "/api/copias"],
    ["//api///copias//", "/api/copias"],
    ["/api%2Fcopias", "/api/copias"],
    ["/api%2fcopias", "/api/copias"],
    ["/%61pi/copias", "/api/copias"],
    ["/LOGIN", "/login"],
    ["/colecoes/%C3%A9", "/colecoes/é"],
  ])("%s → %s", (entrada, saida) => {
    expect(normalizarCaminho(entrada)).toBe(saida);
  });

  it.each([
    ["sem barra inicial", "login"],
    ["vazio", ""],
    ["..", "/api/../login"],
    [".", "/./login"],
    ["%2e%2e", "/api/%2e%2e/copias"],
    ["%2E%2E", "/api/%2E%2E/copias"],
    ["%2e", "/%2e/login"],
    ["barra invertida", "/api\\copias"],
    ["%5C", "/api%5Ccopias"],
    ["controle cru", "/log\nin"],
    ["%0a", "/login%0a"],
    ["%00", "/login%00"],
    ["tab", "/lo\tgin"],
    ["%7f", "/login%7f"],
    ["codificação malformada", "/login%zz"],
    ["% solto", "/login%"],
    ["UTF-8 inválido", "/%C3"],
    ["dupla codificação de ..", "/api/%252e%252e/copias"],
    ["dupla codificação de /", "/api%252Fcopias"],
  ])("recusa %s", (_, entrada) => {
    expect(normalizarCaminho(entrada)).toBeNull();
  });
});

describe("ehRotaPublica", () => {
  const leitura = [
    "/login",
    "/api/saude",
    "/manifest.webmanifest",
    "/robots.txt",
    "/favicon.ico",
    ...ICONES_PWA.map((a) => `/pwa/${a}`),
  ];

  it.each(leitura.flatMap((c) => [["GET", c] as const, ["HEAD", c] as const]))("%s %s é público", (m, c) => {
    expect(ehRotaPublica(m, c)).toBe(true);
  });

  it("POST /api/sessao é público (entrar)", () => {
    expect(ehRotaPublica("POST", "/api/sessao")).toBe(true);
  });

  it.each([
    ["POST", "/login"], // server action numa página pública
    ["DELETE", "/api/sessao"], // sair exige sessão
    ["GET", "/api/sessao"],
    ["PUT", "/api/sessao"],
    ["OPTIONS", "/login"],
    ["POST", "/api/saude"],
    ["PATCH", "/robots.txt"],
    ["get", "/login"],
    ["GET", "/"],
    ["GET", "/api/copias"],
    ["GET", "/API/copias"],
    ["GET", "/api//copias"],
    ["GET", "/api/copias/"],
    ["GET", "/pwa/outro.png"],
    ["GET", "/pwa/"],
    ["GET", "/pwa/icone-180.png/extra"],
    ["GET", "/_next/image"],
    // Variantes de grafia de caminhos públicos: o Next não as serve como a
    // rota pública, e nós não as liberamos.
    ["GET", "/LOGIN"],
    ["GET", "/Login"],
    ["GET", "/login/"],
    ["GET", "//login"],
    ["GET", "/%6Cogin"],
    ["GET", "/login%2F"],
    ["GET", "/api%2Fsaude"],
    ["POST", "/API/sessao"],
    ["POST", "/api/sessao/"],
    ["GET", "/x/%2e%2e/login"],
    ["GET", "/x/../login"],
    ["GET", "/login%00"],
    ["GET", "/login\\"],
    ["GET", "login"],
  ])("%s %s é protegido", (m, c) => {
    expect(ehRotaPublica(m, c)).toBe(false);
  });
});

describe("constantes", () => {
  it("ícones e rotas do módulo", () => {
    expect(ICONES_PWA).toEqual(["icone-180.png", "icone-192.png", "icone-512.png", "icone-maskable-512.png"]);
    expect(CAMINHOS_ROTAS_DO_MODULO).toEqual([
      "api/sessao/route.ts",
      "api/saude/route.ts",
      "robots.txt/route.ts",
      "manifest.webmanifest/route.ts",
      "pwa/[arquivo]/route.ts",
    ]);
  });
});
