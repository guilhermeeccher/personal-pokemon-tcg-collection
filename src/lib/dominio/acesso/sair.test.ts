import { describe, expect, it } from "vitest";

import { destinoAposSair } from "./sair";

describe("destinoAposSair", () => {
  it.each([200, 401])("status %i vai ao login", (status) => {
    expect(destinoAposSair(status)).toBe("login");
  });

  it.each([403, 429, 500, 503, 204, 302])("status %i fica na tela com erro", (status) => {
    expect(destinoAposSair(status)).toBe("erro");
  });

  it("falha de rede (sem status) fica na tela com erro", () => {
    expect(destinoAposSair(null)).toBe("erro");
  });
});
