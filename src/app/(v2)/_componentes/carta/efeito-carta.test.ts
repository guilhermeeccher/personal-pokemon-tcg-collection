import { describe, expect, it } from "vitest";

import { VARIANTES_COPIA } from "@/lib/dominio/enums";

import { efeitoDaCarta } from "./efeito-carta";

describe("efeitoDaCarta", () => {
  it("as três variantes de acabamento passam direto", () => {
    expect(efeitoDaCarta({ variante: "normal", raridade: "Comum" })).toBe("normal");
    expect(efeitoDaCarta({ variante: "reverse", raridade: "Common" })).toBe("reverse");
    expect(efeitoDaCarta({ variante: "holo", raridade: "Rara Holo" })).toBe("holo");
  });

  it("a cópia vence a raridade: holo rara registrada como normal fica normal", () => {
    expect(efeitoDaCarta({ variante: "normal", raridade: "Rare Holo" })).toBe("normal");
    expect(efeitoDaCarta({ variante: "reverse", raridade: "Rara Holo" })).toBe("reverse");
  });

  it("ilustração rara, nos dois idiomas e na especial, vence a variante", () => {
    for (const raridade of ["Illustration rare", "Ilustração Rara", "Special illustration rare", "Ilustração Rara Especial"]) {
      expect(efeitoDaCarta({ variante: "normal", raridade })).toBe("ilustracao");
      expect(efeitoDaCarta({ variante: "holo", raridade })).toBe("ilustracao");
    }
  });

  it("hiper rara, nos dois idiomas e na mega, vence a variante", () => {
    for (const raridade of ["Hyper rare", "Hiper rara", "Mega Hyper Rare", "Mega Hiper Raro"]) {
      expect(efeitoDaCarta({ variante: "reverse", raridade })).toBe("hiper");
    }
  });

  it("1ª edição e promo não são acabamento: o brilho sai da classe de raridade", () => {
    expect(efeitoDaCarta({ variante: "primeira_edicao", raridade: "Rare Holo" })).toBe("holo");
    expect(efeitoDaCarta({ variante: "primeira_edicao", raridade: "Rare" })).toBe("normal");
    expect(efeitoDaCarta({ variante: "promo", raridade: "Ultra Rare" })).toBe("holo");
    expect(efeitoDaCarta({ variante: "promo", raridade: "Promo" })).toBe("normal");
    expect(efeitoDaCarta({ variante: "promo", raridade: null })).toBe("normal");
  });

  it("sem cópia (vaga vazia, carta do catálogo): pela raridade, e nunca reverse", () => {
    expect(efeitoDaCarta({ variante: null, raridade: "Double rare" })).toBe("holo");
    expect(efeitoDaCarta({ variante: undefined, raridade: "Comum" })).toBe("normal");
    expect(efeitoDaCarta({ variante: null, raridade: "Ilustração Rara" })).toBe("ilustracao");
    for (const raridade of ["Comum", "Rara", "Rara Holo", "Hiper rara", null]) {
      expect(efeitoDaCarta({ variante: null, raridade })).not.toBe("reverse");
    }
  });

  it("todo valor do enum variante_copia tem efeito definido", () => {
    for (const variante of VARIANTES_COPIA) {
      expect(efeitoDaCarta({ variante, raridade: "Rara" })).toMatch(/^(normal|reverse|holo|ilustracao|hiper)$/);
    }
  });

  it("raridade desconhecida não inventa brilho", () => {
    expect(efeitoDaCarta({ variante: null, raridade: "Algo novo do upstream" })).toBe("normal");
  });
});
