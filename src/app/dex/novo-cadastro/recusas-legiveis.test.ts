import { describe, expect, it } from "vitest";

import { recusasLegiveis, type NomesDaTela } from "./recusas-legiveis";

const NOMES: Record<string, string> = { "raichu-alola": "Raichu (Forma de Alola)", pikachu: "Pikachu" };
const nomes: NomesDaTela = {
  forma: (id) => NOMES[id] ?? id,
  trilha: (t) => (t === "shiny" ? "Shiny" : "Normal"),
};

describe("recusasLegiveis", () => {
  it("troca o id da forma e a trilha pelos nomes da tela, em cada recusa da lista", () => {
    const corpo = {
      recusas: [
        { chave: "dexVagaJaNoHome", valores: { forma: "raichu-alola", trilha: "shiny" } },
        { chave: "dexSemShiny", valores: { forma: "pikachu" } },
      ],
    };
    expect(recusasLegiveis(corpo, nomes)).toEqual({
      recusas: [
        { chave: "dexVagaJaNoHome", valores: { forma: "Raichu (Forma de Alola)", trilha: "Shiny" } },
        { chave: "dexSemShiny", valores: { forma: "Pikachu" } },
      ],
    });
  });

  it("forma fora da lista fica com o id (é o caso da forma desconhecida)", () => {
    const corpo = { recusas: [{ chave: "dexFormaDesconhecida", valores: { forma: "missingno" } }] };
    expect(recusasLegiveis(corpo, nomes)).toEqual(corpo);
  });

  it("também na recusa única", () => {
    const corpo = { recusa: { chave: "dexSemShiny", valores: { forma: "pikachu" } } };
    expect(recusasLegiveis(corpo, nomes)).toEqual({ recusa: { chave: "dexSemShiny", valores: { forma: "Pikachu" } } });
  });

  it("não mexe nas recusas que não levam a forma, nem no corpo que não é recusa", () => {
    const outra = { recusas: [{ chave: "dexNaoTransferivel", valores: { jogo: "Pokémon GO", forma: "pikachu" } }] };
    expect(recusasLegiveis(outra, nomes)).toEqual(outra);
    expect(recusasLegiveis({ erro: "Corpo inválido." }, nomes)).toEqual({ erro: "Corpo inválido." });
    expect(recusasLegiveis(null, nomes)).toBeNull();
  });

  it("não altera o corpo recebido", () => {
    const corpo = { recusas: [{ chave: "dexSemShiny", valores: { forma: "pikachu" } }] };
    recusasLegiveis(corpo, nomes);
    expect(corpo.recusas[0].valores.forma).toBe("pikachu");
  });
});
