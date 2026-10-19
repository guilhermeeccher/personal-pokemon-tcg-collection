import { describe, expect, it } from "vitest";

import { sanitizarVolta, TAMANHO_MAXIMO_VOLTA } from "./volta";

describe("sanitizarVolta", () => {
  it.each([
    "/",
    "/colecoes",
    "/colecoes/123/opcoes-compra",
    "/inventario?busca=pikachu&pagina=2",
    "/cadastro/busca?q=%C3%A9",
    "/dex/cadastrar?jogo=home#topo",
    "/login-extra",
  ])("mantém %s", (valor) => {
    expect(sanitizarVolta(valor)).toBe(valor);
  });

  it.each([
    ["ausente", undefined],
    ["null", null],
    ["vazio", ""],
    ["relativo sem barra", "colecoes"],
    ["//host", "//exemplo.test"],
    ["///host", "///exemplo.test"],
    ["https:", "https://exemplo.test"],
    ["esquema sem barras", "javascript:alert(1)"],
    ["/\\host", "/\\exemplo.test"],
    ["\\\\host", "\\\\exemplo.test"],
    ["\\ no meio", "/colecoes\\x"],
    ["/%2F%2Fhost", "/%2F%2Fexemplo.test"],
    ["/%2f/host", "/%2f/exemplo.test"],
    ["/%5Chost", "/%5Cexemplo.test"],
    ["%0a", "/colecoes%0aSet-Cookie:x"],
    ["%0d", "/colecoes%0d"],
    ["%00", "/colecoes%00"],
    ["tab cru", "/\t/exemplo.test"],
    ["quebra crua", "/\n/exemplo.test"],
    ["codificação malformada", "/colecoes%zz"],
    ["/login", "/login"],
    ["/login com query", "/login?volta=/colecoes"],
    ["/login/", "/login/"],
    ["/LOGIN", "/LOGIN"],
    ["/%6Cogin", "/%6Cogin"],
    ["..", "/x/../login"],
    ["%2e%2e", "/x/%2e%2e/login"],
    ["longo demais", "/" + "a".repeat(TAMANHO_MAXIMO_VOLTA)],
  ])("recusa %s", (_, valor) => {
    expect(sanitizarVolta(valor)).toBe("/");
  });
});
