import { describe, expect, it } from "vitest";

import { origemPermitida } from "./origem";

const permitidas = new Set(["https://exemplo.test", "http://127.0.0.1:3010"]);
const ok = (metodo: string, origin?: string | null, referer?: string | null) =>
  origemPermitida({ metodo, origin, referer }, permitidas);

describe("origemPermitida", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("%s passa sem olhar origem", (m) => {
    expect(ok(m, "https://outro.test", null)).toBe(true);
    expect(ok(m, undefined, undefined)).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "get", "QUALQUER"])("%s exige origem", (m) => {
    expect(ok(m, "https://exemplo.test")).toBe(true);
    expect(ok(m, "https://outro.test")).toBe(false);
    expect(ok(m)).toBe(false);
  });

  it("Origin na lista, exato", () => {
    expect(ok("POST", "https://exemplo.test")).toBe(true);
    expect(ok("POST", "http://127.0.0.1:3010")).toBe(true);
  });

  it.each([
    "https://exemplo.test/",
    "https://EXEMPLO.test",
    "http://exemplo.test",
    "https://exemplo.test:443",
    "https://sub.exemplo.test",
    "https://exemplo.test.outro.test",
    "http://127.0.0.1:3011",
    "http://localhost:3010",
    "",
  ])("Origin fora da lista: %s", (origin) => {
    expect(ok("POST", origin)).toBe(false);
  });

  it("Origin `null` é recusa, sem consultar o Referer", () => {
    expect(ok("POST", "null", "https://exemplo.test/colecoes")).toBe(false);
  });

  it("Origin inválido é recusa, sem consultar o Referer", () => {
    expect(ok("POST", "lixo", "https://exemplo.test/colecoes")).toBe(false);
    expect(ok("POST", "https://outro.test", "https://exemplo.test/colecoes")).toBe(false);
  });

  it("sem Origin, vale a origem do Referer", () => {
    expect(ok("POST", undefined, "https://exemplo.test/colecoes?x=1#y")).toBe(true);
    expect(ok("POST", null, "http://127.0.0.1:3010/")).toBe(true);
    expect(ok("POST", null, "https://outro.test/colecoes")).toBe(false);
    expect(ok("POST", null, "https://exemplo.test.outro.test/")).toBe(false);
  });

  it.each(["lixo", "", "/colecoes", "data:text/html,x", "about:blank", "javascript:alert(1)"])(
    "Referer inválido ou opaco: %s",
    (referer) => {
      expect(ok("POST", null, referer)).toBe(false);
    },
  );

  it("sem Origin e sem Referer é recusa", () => {
    expect(ok("POST", null, null)).toBe(false);
    expect(ok("DELETE", undefined, undefined)).toBe(false);
  });
});
