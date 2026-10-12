import { describe, expect, it } from "vitest";

import { moduloLivingDexAtivo } from "./modulos";

describe("moduloLivingDexAtivo", () => {
  it("só o valor 1 liga", () => {
    expect(moduloLivingDexAtivo({ MODULO_LIVING_DEX: "1" })).toBe(true);
  });

  it.each([undefined, "", "0", "false", "true", "sim"])("%s não liga", (valor) => {
    expect(moduloLivingDexAtivo({ MODULO_LIVING_DEX: valor })).toBe(false);
  });
});
