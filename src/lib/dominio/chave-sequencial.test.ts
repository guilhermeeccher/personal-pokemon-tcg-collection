import { describe, expect, it } from "vitest";

import { proximaChaveSequencial } from "./chave-sequencial";

describe("proximaChaveSequencial", () => {
  it("sem chaves existentes, começa em '1'", () => {
    expect(proximaChaveSequencial([])).toBe("1");
  });

  it("avança a partir do maior número existente", () => {
    expect(proximaChaveSequencial(["1", "2"])).toBe("3");
  });

  it("ordem de entrada não importa — usa o máximo, não a última", () => {
    expect(proximaChaveSequencial(["3", "1", "2"])).toBe("4");
  });

  it("buraco na numeração nunca é preenchido — próxima chave ignora o buraco", () => {
    // '1' foi removido; '2' continua existindo. A próxima não deve virar '1' de novo.
    expect(proximaChaveSequencial(["2"])).toBe("3");
  });

  it("ignora chave não numérica sem quebrar (defesa; não deveria ocorrer na prática)", () => {
    expect(proximaChaveSequencial(["1", "abc"])).toBe("2");
  });
});
