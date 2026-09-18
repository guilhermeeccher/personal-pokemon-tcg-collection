import { describe, expect, it } from "vitest";

import {
  derivarDexId,
  especieDoNomeDaCarta,
  indexarEspeciesConhecidas,
} from "./dex-id-derivado";

describe("especieDoNomeDaCarta — português", () => {
  it("tira o dono depois da espécie — o caso que originou tudo", () => {
    expect(especieDoNomeDaCarta("Diglett da Equipe Rocket", "pt")).toBe("Diglett");
  });

  it("tira dono e mecânica, nessa ordem", () => {
    // "Metagross ex do Steven": sem tirar o dono primeiro, o " ex" fica no
    // meio da string e não é sufixo de nada.
    expect(especieDoNomeDaCarta("Metagross ex do Steven", "pt")).toBe("Metagross");
    expect(especieDoNomeDaCarta("Vileplume ex da Érica", "pt")).toBe("Vileplume");
  });

  it("cobre as preposições que o catálogo usa", () => {
    expect(especieDoNomeDaCarta("Darumaka do N", "pt")).toBe("Darumaka");
    expect(especieDoNomeDaCarta("Gabite da Cíntia", "pt")).toBe("Gabite");
    expect(especieDoNomeDaCarta("Zorua do N", "pt")).toBe("Zorua");
  });

  it("não corta 'do' dentro da palavra", () => {
    // Sem a exigência de espaço dos dois lados, "Dodrio" viraria "Drio".
    expect(especieDoNomeDaCarta("Dodrio", "pt")).toBe("Dodrio");
    expect(especieDoNomeDaCarta("Deoxys", "pt")).toBe("Deoxys");
  });

  it("preserva hífen do nome da espécie", () => {
    expect(especieDoNomeDaCarta("Ho-Oh ex do Ethan", "pt")).toBe("Ho-Oh");
  });

  it("nome sem dono passa direto pela normalização de sempre", () => {
    expect(especieDoNomeDaCarta("Charizard ex", "pt")).toBe("Charizard");
  });
});

describe("especieDoNomeDaCarta — inglês", () => {
  it("o dono vem antes, então fica o que sobra depois do apóstrofo", () => {
    expect(especieDoNomeDaCarta("Team Rocket's Diglett", "en")).toBe("Diglett");
    expect(especieDoNomeDaCarta("N's Darumaka", "en")).toBe("Darumaka");
  });

  it("aceita o apóstrofo tipográfico, que também aparece no upstream", () => {
    expect(especieDoNomeDaCarta("Team Rocket’s Meowth", "en")).toBe("Meowth");
  });

  it("tira a mecânica depois do dono", () => {
    expect(especieDoNomeDaCarta("Steven's Metagross ex", "en")).toBe("Metagross");
  });
});

describe("especieDoNomeDaCarta — japonês", () => {
  it("tira o dono ligado por の", () => {
    expect(especieDoNomeDaCarta("ナンジャモのハラバリーex", "jp")).toBe("ハラバリー");
    expect(especieDoNomeDaCarta("Nのゾロアークex", "jp")).toBe("ゾロアーク");
  });

  it("tira prefixo de Mega e sufixo de mecânica", () => {
    expect(especieDoNomeDaCarta("メガユキノオーex", "jp")).toBe("ユキノオー");
    expect(especieDoNomeDaCarta("イーユイex", "jp")).toBe("イーユイ");
  });

  it("nome simples fica intacto", () => {
    expect(especieDoNomeDaCarta("フシギソウ", "jp")).toBe("フシギソウ");
  });
});

describe("especieDoNomeDaCarta — entrada degenerada", () => {
  it("vazio e espaço devolvem vazio, nunca lançam", () => {
    expect(especieDoNomeDaCarta("", "pt")).toBe("");
    expect(especieDoNomeDaCarta("   ", "pt")).toBe("");
    expect(especieDoNomeDaCarta("", "jp")).toBe("");
  });
});

describe("derivarDexId", () => {
  const indice = indexarEspeciesConhecidas([
    { nome: "Diglett", idioma: "pt", dexId: 50 },
    { nome: "Diglett de Alola", idioma: "pt", dexId: 50 },
    { nome: "Dugtrio", idioma: "pt", dexId: 51 },
    { nome: "Team Rocket's Diglett", idioma: "en", dexId: 50 },
    { nome: "ディグダ", idioma: "jp", dexId: 50 },
  ]);

  it("acha o número da espécie escondida no nome", () => {
    expect(derivarDexId("Diglett da Equipe Rocket", "pt", indice)).toBe(50);
    expect(derivarDexId("Dugtrio da Equipe Rocket", "pt", indice)).toBe(51);
  });

  it("forma regional não cria número novo — regra 3", () => {
    // "Diglett de Alola" e "Diglett" reduzem à mesma espécie e ao mesmo
    // número; o índice tem um valor só e a derivação não vira ambígua.
    expect(derivarDexId("Diglett da Equipe Rocket", "pt", indice)).toBe(50);
  });

  it("nunca atravessa idiomas", () => {
    // "Diglett" existe no índice em pt e en, mas não em jp: uma carta
    // japonesa chamada "Diglett" não pode se resolver pela linha portuguesa.
    expect(derivarDexId("Diglett", "jp", indice)).toBeNull();
  });

  it("espécie desconhecida no catálogo devolve null", () => {
    expect(derivarDexId("Pikachu da Equipe Rocket", "pt", indice)).toBeNull();
  });

  it("ambiguidade devolve null — nunca escolhe um número", () => {
    const ambiguo = indexarEspeciesConhecidas([
      { nome: "Fulano", idioma: "pt", dexId: 1 },
      { nome: "Fulano", idioma: "pt", dexId: 2 },
    ]);
    expect(derivarDexId("Fulano da Equipe Rocket", "pt", ambiguo)).toBeNull();
  });

  it("nome que não reduz a nada devolve null", () => {
    expect(derivarDexId("", "pt", indice)).toBeNull();
    expect(derivarDexId("   ", "pt", indice)).toBeNull();
  });
});

describe("prefixo de forma japonês que faz parte do nome da espécie", () => {
  // O risco real, achado ao auditar os dados em 2026-08-29: `メガ` (Mega)
  // cola na espécie, sem separador, e há espécies cujo nome COMEÇA com
  // ele. Tirar o prefixo cegamente vira Yanmega em Yanma — carta errada
  // na vaga errada, sem nada indicando o erro.
  const indice = indexarEspeciesConhecidas([
    { nome: "メガヤンマ", idioma: "jp", dexId: 469 }, // Yanmega
    { nome: "ヤンマ", idioma: "jp", dexId: 193 }, // Yanma
    { nome: "ユキノオー", idioma: "jp", dexId: 460 }, // Abomasnow
  ]);

  it("prefere a espécie específica: メガヤンマex é Yanmega, não Yanma", () => {
    expect(derivarDexId("メガヤンマex", "jp", indice)).toBe(469);
  });

  it("cai para a forma sem prefixo quando ela é a espécie de verdade", () => {
    // メガユキノオー (Mega Abomasnow) não existe como espécie própria: o
    // índice só conhece ユキノオー, e é para lá que a derivação desce.
    expect(derivarDexId("メガユキノオーex", "jp", indice)).toBe(460);
  });

  it("a espécie sem prefixo segue resolvendo sozinha", () => {
    expect(derivarDexId("ヤンマex", "jp", indice)).toBe(193);
  });
});

describe("indexarEspeciesConhecidas", () => {
  it("agrupa mecânicas da mesma espécie num número só", () => {
    const i = indexarEspeciesConhecidas([
      { nome: "Charizard", idioma: "pt", dexId: 6 },
      { nome: "Charizard ex", idioma: "pt", dexId: 6 },
      { nome: "Mega Charizard EX", idioma: "pt", dexId: 6 },
    ]);
    expect(i.get("pt:charizard")).toEqual(new Set([6]));
  });

  it("separa idiomas em chaves distintas", () => {
    const i = indexarEspeciesConhecidas([
      { nome: "Diglett", idioma: "pt", dexId: 50 },
      { nome: "Diglett", idioma: "en", dexId: 50 },
    ]);
    expect([...i.keys()].sort()).toEqual(["en:diglett", "pt:diglett"]);
  });
});
