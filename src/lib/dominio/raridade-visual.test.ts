import { describe, expect, it } from "vitest";

import { classificarRaridade } from "./raridade-visual";

/**
 * Os 56 valores distintos de raridade que existem no catálogo real
 * (consultados no banco em 2026-09-03). Servem de fixture porque a
 * classificação só vale se sobreviver ao dado de verdade, bilíngue e
 * cheio de armadilha de substring — não a exemplos inventados.
 */
const RARIDADES_REAIS: readonly string[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Comum",
  "Incomum",
  "None",
  "Promo",
  "Ultra Rare",
  "Rara",
  "Ultra Rara",
  "Holo Rare",
  "Double rare",
  "Illustration rare",
  "Secret Rare",
  "Rare Secreta",
  "Ilustração Rara",
  "Special illustration rare",
  "Shiny rare",
  "Rara Dupla",
  "Rara Holo",
  "Hyper rare",
  "Rara Holo V",
  "Holo Rare V",
  "Shiny rara",
  "Ilustração Rara Especial",
  "Rare Holo",
  "Rara Holo VMAX",
  "Holo Rare VMAX",
  "Mega Hyper Rare",
  "Hiper rara",
  "Triple Rare",
  "Rare Holo LV.X",
  "Character Rare",
  "ACE SPEC Rare",
  "Character Super Rare",
  "ACE SPEC Raro",
  "Rara Holo VSTAR",
  "Holo Rare VSTAR",
  "Radiant Rare",
  "Rare PRIME",
  "Classic Collection",
  "Shiny Ultra Rare",
  "LEGEND",
  "Rara Radiante",
  "Brilhante Ultra Rara",
  "Raras Incríveis",
  "Shiny rara V",
  "Shiny rare V",
  "Amazing Rare",
  "Mega Hiper Raro",
  "Shiny rare VMAX",
  "Shiny rara VMAX",
  "Black White Rare",
  "Arte Completa de Treinador",
  "Full Art Trainer",
  "Rara Preto e Branco",
];

describe("classificarRaridade", () => {
  it("classifica todos os 56 valores reais do catálogo", () => {
    for (const valor of RARIDADES_REAIS) {
      expect(CLASSES_ESPERADAS[valor], `sem expectativa declarada para "${valor}"`).toBeDefined();
      expect(classificarRaridade(valor), `raridade "${valor}"`).toBe(CLASSES_ESPERADAS[valor]);
    }
  });

  it("cobre a fixture inteira — nenhum valor real ficou sem teste", () => {
    expect(Object.keys(CLASSES_ESPERADAS).sort()).toEqual([...RARIDADES_REAIS].sort());
  });

  describe("armadilhas de substring", () => {
    it("não confunde Incomum com Comum", () => {
      expect(classificarRaridade("Incomum")).toBe("incomum");
      expect(classificarRaridade("Comum")).toBe("comum");
    });

    it("não confunde Uncommon com Common", () => {
      expect(classificarRaridade("Uncommon")).toBe("incomum");
      expect(classificarRaridade("Common")).toBe("comum");
    });

    it("não trata Rara Holo como rara simples", () => {
      expect(classificarRaridade("Rara Holo")).toBe("holo");
      expect(classificarRaridade("Rara")).toBe("rara");
    });

    it("não trata Ultra Rara como rara simples", () => {
      expect(classificarRaridade("Ultra Rara")).toBe("secreta");
    });

    it("ignora acento e caixa", () => {
      expect(classificarRaridade("ILUSTRAÇÃO RARA")).toBe("secreta");
      expect(classificarRaridade("ilustracao rara")).toBe("secreta");
    });
  });

  describe("ausência de raridade", () => {
    it("trata None e Sem raridade como comum, sem inventar classe", () => {
      expect(classificarRaridade("None")).toBe("comum");
      expect(classificarRaridade("Sem raridade")).toBe("comum");
    });

    it("aceita null, undefined e vazio", () => {
      expect(classificarRaridade(null)).toBe("comum");
      expect(classificarRaridade(undefined)).toBe("comum");
      expect(classificarRaridade("")).toBe("comum");
    });
  });

  it("cai em comum diante de valor desconhecido, em vez de chutar", () => {
    expect(classificarRaridade("Raridade Que Ainda Não Existe")).toBe("comum");
  });
});

/** A classe esperada para cada valor real. Declarada uma a uma de propósito:
 *  é a revisão humana do mapeamento, não uma derivação da própria função. */
const CLASSES_ESPERADAS: Record<string, string> = {
  Common: "comum",
  Uncommon: "incomum",
  Rare: "rara",
  Comum: "comum",
  Incomum: "incomum",
  None: "comum",
  Promo: "comum",
  "Ultra Rare": "secreta",
  Rara: "rara",
  "Ultra Rara": "secreta",
  "Holo Rare": "holo",
  "Double rare": "holo",
  "Illustration rare": "secreta",
  "Secret Rare": "secreta",
  "Rare Secreta": "secreta",
  "Ilustração Rara": "secreta",
  "Special illustration rare": "secreta",
  "Shiny rare": "holo",
  "Rara Dupla": "holo",
  "Rara Holo": "holo",
  "Hyper rare": "secreta",
  "Rara Holo V": "holo",
  "Holo Rare V": "holo",
  "Shiny rara": "holo",
  "Ilustração Rara Especial": "secreta",
  "Rare Holo": "holo",
  "Rara Holo VMAX": "holo",
  "Holo Rare VMAX": "holo",
  "Mega Hyper Rare": "secreta",
  "Hiper rara": "secreta",
  "Triple Rare": "holo",
  "Rare Holo LV.X": "holo",
  "Character Rare": "secreta",
  "ACE SPEC Rare": "secreta",
  "Character Super Rare": "secreta",
  "ACE SPEC Raro": "secreta",
  "Rara Holo VSTAR": "holo",
  "Holo Rare VSTAR": "holo",
  "Radiant Rare": "holo",
  "Rare PRIME": "holo",
  "Classic Collection": "holo",
  "Shiny Ultra Rare": "secreta",
  LEGEND: "secreta",
  "Rara Radiante": "holo",
  "Brilhante Ultra Rara": "secreta",
  "Raras Incríveis": "holo",
  "Shiny rara V": "holo",
  "Shiny rare V": "holo",
  "Amazing Rare": "holo",
  "Mega Hiper Raro": "secreta",
  "Shiny rare VMAX": "holo",
  "Shiny rara VMAX": "holo",
  "Black White Rare": "holo",
  "Arte Completa de Treinador": "secreta",
  "Full Art Trainer": "secreta",
  "Rara Preto e Branco": "holo",
};
