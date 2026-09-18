import { describe, expect, it } from "vitest";

import {
  type LinhaCatalogoParaNome,
  normalizarNomeCarta,
  resolverNomeEspecie,
  resolverDexIdsPorNome,
} from "./nome-especie";

function linha(
  nome: string,
  dexIds: number[],
  idioma: "pt" | "en" = "pt",
): LinhaCatalogoParaNome {
  return { nome, dexIds, idioma };
}

describe("normalizarNomeCarta", () => {
  it("remove sufixos de mecânica comuns", () => {
    expect(normalizarNomeCarta("Charizard ex")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard EX")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard V")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard VMAX")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard VSTAR")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard V-ASTRO")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard GX")).toBe("Charizard");
    expect(normalizarNomeCarta("Charizard-GX")).toBe("Charizard");
    expect(normalizarNomeCarta("Pikachu V-UNIÃO")).toBe("Pikachu");
  });

  it("remove prefixo Mega/Gigantamax e a letra de forma (X/Y)", () => {
    expect(normalizarNomeCarta("Mega Charizard X ex")).toBe("Charizard");
    expect(normalizarNomeCarta("Mega Charizard Y ex")).toBe("Charizard");
    expect(normalizarNomeCarta("M-Charizard EX")).toBe("Charizard");
    expect(normalizarNomeCarta("M Charizard EX")).toBe("Charizard");
    expect(normalizarNomeCarta("Gigantamax Pikachu")).toBe("Pikachu");
  });

  it("remove sufixo pt / prefixo en de forma regional", () => {
    expect(normalizarNomeCarta("Raichu de Alola")).toBe("Raichu");
    expect(normalizarNomeCarta("Alolan Raichu")).toBe("Raichu");
    expect(normalizarNomeCarta("Obstagoon de Galar")).toBe("Obstagoon");
    expect(normalizarNomeCarta("Galarian Obstagoon")).toBe("Obstagoon");
  });

  it("nome já puro não muda", () => {
    expect(normalizarNomeCarta("Pikachu")).toBe("Pikachu");
    expect(normalizarNomeCarta("Enamorus")).toBe("Enamorus");
  });

  it("nome fora do padrão conhecido fica como está (lista é aberta)", () => {
    expect(normalizarNomeCarta("Detective Pikachu")).toBe("Detective Pikachu");
    expect(normalizarNomeCarta("Charizard V do Lance")).toBe(
      "Charizard V do Lance",
    );
  });
});

describe("resolverNomeEspecie", () => {
  it("dex 6 resolve Charizard mesmo com maioria das cartas trazendo sufixo de mecânica", () => {
    // Amostra real do catálogo (pt, 2026-08-25).
    const linhas = [
      linha("Charizard ex", [6]),
      linha("Charizard ex", [6]),
      linha("Charizard", [6]),
      linha("Charizard V", [6]),
      linha("M-Charizard EX", [6]),
      linha("Mega Charizard X ex", [6]),
      linha("Charizard GX", [6]),
      linha("Charizard V-ASTRO", [6]),
      linha("Charizard EX", [6]),
      linha("Charizard VMAX", [6]),
      linha("Mega Charizard Y ex", [6]),
      linha("Charizard Radiante", [6]),
      linha("Charizard V do Lance", [6]),
      // carta de dex diferente não deve entrar na contagem.
      linha("Charmander", [4]),
    ];
    expect(resolverNomeEspecie(6, linhas)).toBe("Charizard");
  });

  it("dex 25 resolve Pikachu mesmo com variações de nome de treinador", () => {
    const linhas = [
      linha("Pikachu", [25]),
      linha("Pikachu ex", [25]),
      linha("Pikachu V", [25]),
      linha("Pikachu VMAX", [25]),
      linha("Detective Pikachu", [25]),
      linha("Pikachu Surfista", [25]),
      linha("Pikachu Voador", [25]),
    ];
    expect(resolverNomeEspecie(25, linhas)).toBe("Pikachu");
  });

  it("dex 26 resolve Raichu, sem que a forma de Alola desdobre (regra 3)", () => {
    const linhas = [
      linha("Raichu", [26]),
      linha("Raichu de Alola", [26]),
      linha("Raichu e Raichu de Alola GX", [26]),
      linha("Raichu GX", [26]),
      linha("Raichu V", [26]),
      linha("Raichu TURBO", [26]),
    ];
    expect(resolverNomeEspecie(26, linhas)).toBe("Raichu");
  });

  it("dex 905 resolve Enamorus", () => {
    const linhas = [linha("Enamorus", [905]), linha("Enamorus V", [905])];
    expect(resolverNomeEspecie(905, linhas)).toBe("Enamorus");
  });

  it("ignora carta com mais de um dexId (tag team — regra 2)", () => {
    const linhas = [
      linha("Charizard & Braixen-GX", [6, 655]),
      linha("Charmander", [4]),
    ];
    expect(resolverNomeEspecie(6, linhas)).toBeNull();
  });

  it("cai para en quando não há nenhuma linha pt elegível", () => {
    const linhas = [
      linha("Enamorus", [905], "en"),
      linha("Enamorus V", [905], "en"),
    ];
    expect(resolverNomeEspecie(905, linhas)).toBe("Enamorus");
  });

  it("prefere pt quando há pt e en juntos", () => {
    const linhas = [
      linha("Pikachu", [25], "pt"),
      linha("Raichu", [25], "en"), // nome propositalmente diferente para provar a preferência
    ];
    expect(resolverNomeEspecie(25, linhas)).toBe("Pikachu");
  });

  it("número sem nenhuma carta elegível fica sem nome — nunca inventa", () => {
    const linhas = [linha("Charmander", [4])];
    expect(resolverNomeEspecie(9999, linhas)).toBeNull();
  });

  it("lista vazia fica sem nome", () => {
    expect(resolverNomeEspecie(25, [])).toBeNull();
  });
});

describe("resolverDexIdsPorNome", () => {
  const l = (nome: string, idioma: "pt" | "en" | "jp", dexIds: number[]) => ({
    nome,
    idioma,
    dexIds,
  });

  it("acha o número da espécie pelo nome ocidental", () => {
    // O caso real: o usuário busca "Ivysaur" e precisa achar フシギソウ,
    // que só compartilha com ele o dexId 2.
    expect(
      resolverDexIdsPorNome("Ivysaur", [
        l("Ivysaur", "pt", [2]),
        l("Charizard", "pt", [6]),
      ]),
    ).toEqual([2]);
  });

  it("nome japonês também identifica o número — a ponte não tem idioma", () => {
    // Desde 2026-08-29 a consulta que alimenta esta função lê os TRÊS
    // idiomas. Antes só pt/en entravam, e a ponte funcionava num sentido
    // só: "Ivysaur" achava フシギソウ, mas フシギソウ não achava as
    // cartas ocidentais de Ivysaur.
    expect(
      resolverDexIdsPorNome("フシギソウ", [
        l("フシギソウ", "jp", [2]),
        l("Charizard", "pt", [6]),
      ]),
    ).toEqual([2]);
  });

  it("o número achado pelo japonês alcança a linha ocidental da mesma espécie", () => {
    // É o que faz a busca ser simétrica: digitando o nome japonês, o
    // número 11 sai daqui e a consulta traz Metapod em pt e en junto.
    expect(
      resolverDexIdsPorNome("トランセル", [
        l("トランセル", "jp", [11]),
        l("Metapod", "pt", [11]),
        l("Kakuna", "pt", [14]),
      ]),
    ).toEqual([11]);
  });

  it("tag team japonesa não expande — regra 2 vale em qualquer idioma", () => {
    expect(
      resolverDexIdsPorNome("ピカチュウ", [l("ピカチュウ&ゼクロムGX", "jp", [25, 644])]),
    ).toEqual([]);
  });

  it("ignora a mecânica no nome da carta e na consulta", () => {
    expect(
      resolverDexIdsPorNome("charizard", [l("Charizard ex", "en", [6])]),
    ).toEqual([6]);
    expect(
      resolverDexIdsPorNome("Mega Charizard EX", [l("Charizard", "pt", [6])]),
    ).toEqual([6]);
  });

  it("não usa carta com mais de um dexId", () => {
    // "Pikachu & Zekrom GX" não pode fazer uma busca por Zekrom trazer
    // todo Pikachu japonês do catálogo.
    expect(
      resolverDexIdsPorNome("Zekrom", [l("Pikachu & Zekrom GX", "en", [25, 644])]),
    ).toEqual([]);
  });

  it("junta números distintos quando o nome casa com mais de uma espécie", () => {
    expect(
      resolverDexIdsPorNome("Raichu", [
        l("Raichu", "pt", [26]),
        l("Raichu de Alola", "pt", [26]),
        l("Pikachu", "pt", [25]),
      ]),
    ).toEqual([26]);
  });

  it("devolve vazio para consulta vazia ou sem correspondência", () => {
    expect(resolverDexIdsPorNome("", [l("Ivysaur", "pt", [2])])).toEqual([]);
    expect(resolverDexIdsPorNome("   ", [l("Ivysaur", "pt", [2])])).toEqual([]);
    expect(resolverDexIdsPorNome("Xyzzy", [l("Ivysaur", "pt", [2])])).toEqual([]);
  });
});
