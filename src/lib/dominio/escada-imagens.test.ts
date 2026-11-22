import { describe, expect, it } from "vitest";

import { type EstadoEscada, falhasDaEscada, registrarFalha } from "./escada-imagens";

const inicial: EstadoEscada = { chave: "", falhas: 0 };

describe("escada de imagens", () => {
  it("cada falha avança um degrau da mesma escada", () => {
    const fontes = ["a", "b"];
    const um = registrarFalha(inicial, fontes);
    expect(falhasDaEscada(um, fontes)).toBe(1);
    expect(falhasDaEscada(registrarFalha(um, fontes), fontes)).toBe(2);
  });

  it("falha de A, depois a escada vira [B]: B é tentada, não herda a falha", () => {
    const comA = registrarFalha(inicial, ["A"]);
    expect(falhasDaEscada(comA, ["A"])).toBe(1);
    expect(falhasDaEscada(comA, ["B"])).toBe(0);
  });

  it("uma falha numa escada nova recomeça a contagem dela", () => {
    const comA = registrarFalha(registrarFalha(inicial, ["A", "A2"]), ["A", "A2"]);
    expect(falhasDaEscada(registrarFalha(comA, ["B"]), ["B"])).toBe(1);
  });

  it("escada vazia não tem falha a contar", () => {
    expect(falhasDaEscada(inicial, [])).toBe(0);
  });
});
