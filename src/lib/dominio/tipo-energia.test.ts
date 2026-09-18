import { describe, expect, it } from "vitest";

import { energiaDaCarta, TIPOS_ENERGIA } from "./tipo-energia";

/**
 * Os onze valores distintos que `carta_catalogo.tipos` contém no banco
 * real, com a contagem de cartas de cada um (consultados em 2026-09-03).
 * A contagem está aqui só para deixar claro que nenhum deles é hipótese.
 */
const TIPOS_REAIS: readonly [string, string][] = [
  ["Water", "agua"],
  ["Psychic", "psiquico"],
  ["Grass", "planta"],
  ["Colorless", "incolor"],
  ["Fighting", "lutador"],
  ["Fire", "fogo"],
  ["Lightning", "eletrico"],
  ["Darkness", "sombrio"],
  ["Metal", "metal"],
  ["Dragon", "dragao"],
  ["Fairy", "fada"],
];

describe("energiaDaCarta", () => {
  it("traduz os onze tipos que existem no catálogo", () => {
    for (const [upstream, esperado] of TIPOS_REAIS) {
      expect(energiaDaCarta([upstream]), upstream).toBe(esperado);
    }
  });

  it("cobre o enum inteiro — nenhuma cor do design system ficou órfã", () => {
    const traduzidos = TIPOS_REAIS.map(([, e]) => e).sort();
    expect(traduzidos).toEqual([...TIPOS_ENERGIA].sort());
  });

  describe("ausência de tipo é resposta legítima", () => {
    it("devolve null para lista vazia (Treinador, Energia)", () => {
      expect(energiaDaCarta([])).toBeNull();
    });

    it("devolve null para null e undefined", () => {
      expect(energiaDaCarta(null)).toBeNull();
      expect(energiaDaCarta(undefined)).toBeNull();
    });

    it("devolve null para tipo desconhecido, em vez de chutar uma cor", () => {
      expect(energiaDaCarta(["Bug"])).toBeNull();
      expect(energiaDaCarta(["Steel"])).toBeNull();
    });
  });

  describe("carta de dois tipos", () => {
    it("usa o primeiro tipo, porque a vaga tem uma cor só", () => {
      expect(energiaDaCarta(["Fire", "Water"])).toBe("fogo");
      expect(energiaDaCarta(["Water", "Fire"])).toBe("agua");
    });

    it("pula um primeiro tipo desconhecido em vez de desistir", () => {
      expect(energiaDaCarta(["Bug", "Water"])).toBe("agua");
    });
  });

  it("tolera caixa e espaço, que já apareceram em dado de terceiro", () => {
    expect(energiaDaCarta(["WATER"])).toBe("agua");
    expect(energiaDaCarta([" water "])).toBe("agua");
  });
});
