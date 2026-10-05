import { describe, expect, it } from "vitest";

import { ordenarPorDestaque, pontuarDestaque } from "./destaque-carta";

describe("pontuarDestaque", () => {
  it("a classe da raridade manda antes do degrau da vitrine", () => {
    // Uma "Hyper" de classe secreta vence qualquer holo, e holo vence comum.
    expect(pontuarDestaque("Hyper rare")[0]).toBeGreaterThan(pontuarDestaque("Double rare")[0]);
    expect(pontuarDestaque("Rara Dupla")[0]).toBeGreaterThan(pontuarDestaque("Comum")[0]);
  });

  it("dentro de secreta, desempata hiper > especial > ultra > ilustração", () => {
    const degrau = (r: string) => pontuarDestaque(r)[1];
    expect(degrau("Mega Hiper Raro")).toBeGreaterThan(degrau("Ilustração Rara Especial"));
    expect(degrau("Special illustration rare")).toBeGreaterThan(degrau("Ultra Rare"));
    expect(degrau("Ultra Rara")).toBeGreaterThan(degrau("Ilustração Rara"));
    expect(degrau("Futuristic Rare")).toBe(degrau("Hyper rare"));
  });

  it("raridade ausente é comum e sem degrau", () => {
    expect(pontuarDestaque(null)).toEqual([0, 0]);
  });
});

describe("ordenarPorDestaque", () => {
  it("põe a mais vistosa primeiro e desempata pelo maior número impresso", () => {
    const cartas = [
      { raridade: "Comum", localId: "001" },
      { raridade: "Ilustração Rara", localId: "133" },
      { raridade: "Ilustração Rara", localId: "140" },
      { raridade: "Mega Hiper Raro", localId: "187" },
      { raridade: "Ilustração Rara Especial", localId: "177" },
    ];
    expect(ordenarPorDestaque(cartas).map((c) => c.localId)).toEqual([
      "187",
      "177",
      "140",
      "133",
      "001",
    ]);
  });

  it("não altera o array de entrada", () => {
    const cartas = [
      { raridade: "Comum", localId: "001" },
      { raridade: "Ultra Rara", localId: "155" },
    ];
    ordenarPorDestaque(cartas);
    expect(cartas[0].localId).toBe("001");
  });
});
