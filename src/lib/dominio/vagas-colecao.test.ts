import { describe, expect, it } from "vitest";

import {
  resolverChavesVagas,
  resolverChavesVagasCustomizada,
  resolverChavesVagasPokedex,
  resolverChavesVagasSet,
} from "./vagas-colecao";

describe("resolverChavesVagasPokedex", () => {
  it("nacional produz 1025 chaves de '1' a '1025'", () => {
    const chaves = resolverChavesVagasPokedex({ escopo: "nacional" });
    expect(chaves).toHaveLength(1025);
    expect(chaves[0]).toBe("1");
    expect(chaves[chaves.length - 1]).toBe("1025");
  });

  it("Kanto produz 151 chaves", () => {
    const chaves = resolverChavesVagasPokedex({
      escopo: "regioes",
      regioes: ["kanto"],
    });
    expect(chaves).toHaveLength(151);
  });

  it("Kanto + Johto produz 251 chaves", () => {
    const chaves = resolverChavesVagasPokedex({
      escopo: "regioes",
      regioes: ["kanto", "johto"],
    });
    expect(chaves).toHaveLength(251);
  });
});

describe("resolverChavesVagasSet", () => {
  it("corta na quantidade oficial quando não inclui secretas", () => {
    const localIds = Array.from({ length: 207 }, (_, i) =>
      String(i + 1).padStart(3, "0"),
    );
    const chaves = resolverChavesVagasSet({
      localIdsDoSet: localIds,
      qtdOficial: 165,
      qtdTotal: 207,
      incluirSecretas: false,
    });
    expect(chaves).toHaveLength(165);
    expect(chaves[0]).toBe("001");
    expect(chaves[chaves.length - 1]).toBe("165");
  });

  it("corta na quantidade total quando inclui secretas", () => {
    const localIds = Array.from({ length: 207 }, (_, i) =>
      String(i + 1).padStart(3, "0"),
    );
    const chaves = resolverChavesVagasSet({
      localIdsDoSet: localIds,
      qtdOficial: 165,
      qtdTotal: 207,
      incluirSecretas: true,
    });
    expect(chaves).toHaveLength(207);
    expect(chaves[chaves.length - 1]).toBe("207");
  });

  it("ordena local_id não-numérico de forma natural antes de cortar", () => {
    // Ex.: sets com promos/trainer gallery ("TG01") intercalados com a
    // numeração normal — ordenação natural mantém "TG01" depois de "10".
    const localIds = ["2", "10", "1", "TG01", "TG02"];
    const chaves = resolverChavesVagasSet({
      localIdsDoSet: localIds,
      qtdOficial: 3,
      qtdTotal: 5,
      incluirSecretas: false,
    });
    expect(chaves).toEqual(["1", "2", "10"]);
  });

  it("não recebe range gerado — as chaves vêm só do que está em localIdsDoSet", () => {
    const chaves = resolverChavesVagasSet({
      localIdsDoSet: ["005", "003", "001"],
      qtdOficial: 10, // maior que o disponível — não inventa chave
      qtdTotal: 10,
      incluirSecretas: false,
    });
    expect(chaves).toEqual(["001", "003", "005"]);
  });

  it("set sem numeração oficial (caso mep: qtdOficial=0, 88 cartas no catálogo) usa qtdTotal, nunca corta em 0", () => {
    const localIds = Array.from({ length: 88 }, (_, i) => String(i + 1));
    const chaves = resolverChavesVagasSet({
      localIdsDoSet: localIds,
      qtdOficial: 0,
      qtdTotal: 88,
      incluirSecretas: false,
    });
    expect(chaves).toHaveLength(88);
  });
});

describe("resolverChavesVagasCustomizada", () => {
  it("nunca gera vaga na criação", () => {
    expect(resolverChavesVagasCustomizada()).toEqual([]);
  });
});

describe("resolverChavesVagas (dispatcher)", () => {
  it("despacha pokedex corretamente", () => {
    const chaves = resolverChavesVagas({
      tipo: "pokedex",
      parametro: { escopo: "nacional" },
    });
    expect(chaves).toHaveLength(1025);
  });

  it("despacha set corretamente", () => {
    const chaves = resolverChavesVagas({
      tipo: "set",
      localIdsDoSet: ["001", "002", "003"],
      qtdOficial: 2,
      qtdTotal: 3,
      incluirSecretas: false,
    });
    expect(chaves).toEqual(["001", "002"]);
  });

  it("despacha customizada corretamente", () => {
    expect(resolverChavesVagas({ tipo: "customizada" })).toEqual([]);
  });
});
