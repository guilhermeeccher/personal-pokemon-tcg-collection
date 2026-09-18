import { describe, expect, it } from "vitest";

import { idCartaManual, validarCartaManual } from "./carta-manual";

const BASE = {
  setId: "SMH",
  setNome: "GX Starter Decks",
  localId: "011",
  nome: "Charmander",
  idioma: "jp",
};

describe("validarCartaManual", () => {
  it("aceita o caso que motivou o recurso", () => {
    // Charmander SMH 011/131: set que a TCGdex não catalogou em fonte
    // nenhuma, e que o usuário tem na mão.
    const r = validarCartaManual({ ...BASE, dexId: 4, qtdSet: 131 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.carta.setId).toBe("SMH");
      expect(r.carta.localId).toBe("011");
      expect(r.carta.dexIds).toEqual([4]);
      expect(r.carta.qtdSet).toBe(131);
      expect(r.carta.idioma).toBe("jp");
    }
  });

  it("preserva o zero à esquerda do número", () => {
    // "011" e "11" são cartas diferentes de sets diferentes; o número é
    // texto em todo o sistema, nunca vira Number.
    const r = validarCartaManual({ ...BASE });
    expect(r.ok && r.carta.localId).toBe("011");
  });

  it("aceita carta sem Pokédex (Treinador, Energia)", () => {
    const r = validarCartaManual({ ...BASE, nome: "Poké Ball" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.carta.dexIds).toEqual([]);
  });

  it("recusa número de Pokédex inventado", () => {
    // Aceitar isso materializaria vaga de Pokédex para um número que não
    // existe — pior que a ausência da carta.
    expect(validarCartaManual({ ...BASE, dexId: 9999 }).ok).toBe(false);
    expect(validarCartaManual({ ...BASE, dexId: 0 }).ok).toBe(false);
    expect(validarCartaManual({ ...BASE, dexId: "abc" }).ok).toBe(false);
    expect(validarCartaManual({ ...BASE, dexId: 4.5 }).ok).toBe(false);
  });

  it("exige set, número, nome e idioma", () => {
    const r = validarCartaManual({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBeGreaterThanOrEqual(4);
  });

  it("recusa idioma fora do enum", () => {
    expect(validarCartaManual({ ...BASE, idioma: "fr" }).ok).toBe(false);
  });

  it("usa a sigla como nome do set quando o nome não vem", () => {
    const r = validarCartaManual({ ...BASE, setNome: undefined });
    expect(r.ok && r.carta.setNome).toBe("SMH");
  });

  it("aparar espaços não vira campo preenchido", () => {
    expect(validarCartaManual({ ...BASE, nome: "   " }).ok).toBe(false);
  });
});

describe("idCartaManual", () => {
  it("usa o mesmo formato do upstream", () => {
    // Sem prefixo de "manual": se a TCGdex catalogar o set um dia, o sync
    // atualiza esta mesma linha e a cópia herda os dados oficiais.
    expect(idCartaManual("SMH", "011")).toBe("SMH-011");
  });
});
