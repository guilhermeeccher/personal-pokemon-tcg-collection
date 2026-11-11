import { describe, expect, it } from "vitest";

import { fonteDePreco } from "./fonte-preco";

describe("fonteDePreco", () => {
  it("só o valor exato `cardmarket` liga a fonte nova", () => {
    expect(fonteDePreco({ PRECO_FONTE: "cardmarket" })).toBe("cardmarket");
  });

  it("ausente, vazio ou qualquer outro valor fica na Liga", () => {
    for (const valor of [undefined, "", "liga", "Cardmarket", " cardmarket", "cardmarket ", "tcgplayer", "1"]) {
      expect(fonteDePreco({ PRECO_FONTE: valor })).toBe("liga");
    }
    expect(fonteDePreco({})).toBe("liga");
  });
});
