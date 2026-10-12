import { describe, expect, it } from "vitest";

import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma, serializarSeedDex, type VagaSeedDex } from "./seed-dex";

const vagas: VagaSeedDex[] = [
  {
    id: "bulbasaur",
    numero: 1,
    especie: "Bulbasaur",
    forma: null,
    formaPt: null,
    categoria: "base",
    geracao: 1,
    lendario: false,
    mitico: false,
    shinyObtenivel: true,
    sprite: "1",
    ordem: 1,
  },
  {
    id: "tauros-paldea-combat-breed",
    numero: 128,
    especie: "Tauros",
    forma: 'Paldean Form, "Combat Breed"',
    formaPt: 'Forma de Paldea, "Espécie de Combate"',
    categoria: "regional",
    geracao: 1,
    lendario: false,
    mitico: false,
    shinyObtenivel: false,
    sprite: "10250",
    ordem: 2,
  },
];

describe("seed/dex-forma.csv — ida e volta", () => {
  it("o que o gerador escreve é o que o seed lê", () => {
    const texto = serializarSeedDex(vagas);
    const lidas = lerRegistrosCsv(texto, COLUNAS_DEX_FORMA).map(converterLinhaDexForma);
    expect(lidas).toEqual(vagas);
  });

  it("forma nula sai como campo vazio sem aspas, e volta nula", () => {
    const texto = serializarSeedDex(vagas.slice(0, 1));
    expect(texto.split("\n")[1]).toBe("bulbasaur,1,Bulbasaur,,,base,1,f,f,t,1,1");
  });

  it("categoria desconhecida aborta a leitura", () => {
    const texto = serializarSeedDex(vagas.slice(0, 1)).replace(",base,", ",lendaria,");
    expect(() => lerRegistrosCsv(texto, COLUNAS_DEX_FORMA).map(converterLinhaDexForma)).toThrow(/categoria/);
  });
});
