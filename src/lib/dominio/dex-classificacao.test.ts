import { describe, expect, it } from "vitest";

import {
  classificarFormasDex,
  destinoDaForma,
  shinyObtenivel,
  type EspeciePokeapi,
  type FormaPokeapi,
  type PokemonPokeapi,
} from "./dex-classificacao";

/*
 * Linhas montadas à mão no formato dos CSVs da PokeAPI — poucas espécies,
 * só o que cada caso precisa. O arquivo real não entra no teste: a regra é
 * o que está sob teste, não o dado de hoje.
 */
function especie(id: number, identificador: string, extra: Partial<EspeciePokeapi> = {}): EspeciePokeapi {
  return {
    id,
    identificador,
    nome: identificador[0].toUpperCase() + identificador.slice(1),
    geracao: 1,
    diferencaGenero: false,
    lendario: false,
    mitico: false,
    ...extra,
  };
}

let proximaForma = 1;
function forma(
  identificador: string,
  pokemonId: number,
  extra: Partial<FormaPokeapi> = {},
): FormaPokeapi {
  const id = proximaForma++;
  return {
    id,
    identificador,
    identificadorForma: identificador.includes("-") ? identificador.split("-").slice(1).join("-") : null,
    pokemonId,
    padrao: true,
    soBatalha: false,
    mega: false,
    ordem: id,
    nomeForma: identificador.includes("-") ? `Forma ${identificador}` : null,
    ...extra,
  };
}

const pokemon = (id: number, especieId: number, padrao = true): PokemonPokeapi => ({ id, especieId, padrao });

describe("destinoDaForma — as decisões que as fontes divergiam", () => {
  it.each([
    ["raticate-totem-alola", "fora"],
    ["mimikyu-totem-disguised", "fora"],
    ["pikachu-cosplay", "fora"],
    ["pikachu-starter", "fora"],
    ["pichu-spiky-eared", "fora"],
    ["arceus-fire", "fora"],
    ["silvally-water", "fora"],
    ["giratina-origin", "fora"],
    ["kyurem-black", "fora"],
    ["calyrex-shadow", "fora"],
    ["ogerpon-wellspring-mask", "fora"],
    ["koraidon-sprinting-build", "fora"],
    ["mothim-sandy", "fora"],
    ["scatterbug-polar", "fora"],
    ["minior-red", "fora"],
    ["minior-blue-meteor", "fora"],
  ])("%s fica fora", (id, destino) => {
    expect(destinoDaForma(id)).toBe(destino);
  });

  it("boné de Alola é cosmético, não regional — a ordem das regras importa", () => {
    expect(destinoDaForma("pikachu-alola-cap")).toBe("cosmetica");
  });

  it.each(["pikachu-world-cap", "magearna-original", "zarude-dada", "dudunsparce-three-segment"])(
    "%s só muda a aparência: cosmética",
    (id) => {
      expect(destinoDaForma(id)).toBe("cosmetica");
    },
  )

  it.each([
    ["raichu-alola", "regional"],
    ["darmanitan-galar-standard", "regional"],
    ["tauros-paldea-combat-breed", "regional"],
    ["sneasel-hisui", "regional"],
    ["vivillon-poke-ball", "cosmetica"],
    ["minior-blue", "cosmetica"],
    ["alcremie-ruby-swirl-star-sweet", "cosmetica"],
    ["meowstic-female", "genero"],
    ["pyroar-female", "genero"],
    ["greninja-battle-bond", "fora"],
    ["rockruff-own-tempo", "fora"],
    ["zygarde-10-power-construct", "fora"],
    ["zygarde-50-power-construct", "fora"],
    ["floette-eternal", "especial"],
    ["rotom-wash", "especial"],
    ["ursaluna-bloodmoon", "especial"],
  ])("%s → %s", (id, destino) => {
    expect(destinoDaForma(id)).toBe(destino);
  });

  it("forma desconhecida não tem destino — nunca é chutada", () => {
    expect(destinoDaForma("pikachu-forma-inventada")).toBeNull();
  });
});

describe("classificarFormasDex", () => {
  it("base sempre entra, com o id da espécie; forma de batalha e Mega nunca", () => {
    const r = classificarFormasDex({
      especies: [especie(6, "charizard")],
      pokemons: [pokemon(6, 6), pokemon(10034, 6, false), pokemon(10196, 6, false)],
      formas: [
        forma("charizard", 6),
        forma("charizard-mega-x", 10034, { mega: true }),
        forma("charizard-gmax", 10196, { soBatalha: true }),
      ],
    });
    expect(r.vagas.map((v) => v.id)).toEqual(["charizard"]);
    expect(r.vagas[0]).toMatchObject({ categoria: "base", numero: 6, forma: null, sprite: "6" });
    expect(r.semClassificacao).toEqual([]);
  });

  it("forma sem regra vai para semClassificacao e não vira vaga", () => {
    const r = classificarFormasDex({
      especies: [especie(25, "pikachu")],
      pokemons: [pokemon(25, 25), pokemon(19999, 25, false)],
      formas: [forma("pikachu", 25), forma("pikachu-inventado", 19999)],
    });
    expect(r.semClassificacao).toEqual(["pikachu-inventado"]);
    expect(r.vagas.map((v) => v.id)).toEqual(["pikachu"]);
  });

  it("forma incluída sem nome vai para semNome", () => {
    const r = classificarFormasDex({
      especies: [especie(479, "rotom")],
      pokemons: [pokemon(479, 479), pokemon(10009, 479, false)],
      formas: [forma("rotom", 479), forma("rotom-wash", 10009, { nomeForma: null })],
    });
    expect(r.semNome).toEqual(["rotom-wash"]);
  });

  it("gera a fêmea da base para espécie com diferença de gênero, logo depois dela", () => {
    const r = classificarFormasDex({
      especies: [especie(19, "rattata", { diferencaGenero: true })],
      pokemons: [pokemon(19, 19), pokemon(10091, 19, false)],
      formas: [forma("rattata", 19), forma("rattata-alola", 10091)],
    });
    expect(r.vagas.map((v) => [v.id, v.categoria, v.sprite])).toEqual([
      ["rattata", "base", "19"],
      ["rattata-femea", "genero", "female/19"],
      ["rattata-alola", "regional", "10091"],
    ]);
    expect(r.vagas.map((v) => v.ordem)).toEqual([1, 2, 3]);
  });

  it("não gera fêmea quando a PokeAPI já modela a fêmea como forma", () => {
    const r = classificarFormasDex({
      especies: [especie(668, "pyroar", { diferencaGenero: true })],
      pokemons: [pokemon(668, 668)],
      formas: [
        forma("pyroar", 668, { identificadorForma: "male", nomeForma: "Male" }),
        forma("pyroar-female", 668, { padrao: false, identificadorForma: "female", nomeForma: "Female" }),
      ],
    });
    expect(r.vagas.map((v) => [v.id, v.categoria, v.sprite])).toEqual([
      ["pyroar", "base", "668"],
      ["pyroar-female", "genero", "668-female"],
    ]);
  });

  it("forma cosmética que divide o Pokémon com a base usa o sprite <id>-<forma>", () => {
    const r = classificarFormasDex({
      especies: [especie(201, "unown")],
      pokemons: [pokemon(201, 201)],
      formas: [
        forma("unown-a", 201, { identificadorForma: "a", nomeForma: "A" }),
        forma("unown-b", 201, { padrao: false, identificadorForma: "b", nomeForma: "B" }),
      ],
    });
    expect(r.vagas.map((v) => [v.id, v.forma, v.sprite])).toEqual([
      ["unown", "A", "201"],
      ["unown-b", "B", "201-b"],
    ]);
  });

  it("a fêmea do Sneasel de Hisui entra logo depois da forma regional", () => {
    const r = classificarFormasDex({
      especies: [especie(215, "sneasel", { diferencaGenero: true })],
      pokemons: [pokemon(215, 215), pokemon(10235, 215, false)],
      formas: [forma("sneasel", 215), forma("sneasel-hisui", 10235)],
    });
    expect(r.vagas.map((v) => [v.id, v.sprite])).toEqual([
      ["sneasel", "215"],
      ["sneasel-femea", "female/215"],
      ["sneasel-hisui", "10235"],
      ["sneasel-hisui-femea", "female/10235"],
    ]);
  });

  it("a base do Minior é o núcleo vermelho, no nome e no sprite", () => {
    const r = classificarFormasDex({
      especies: [especie(774, "minior")],
      pokemons: [pokemon(774, 774)],
      formas: [forma("minior-red-meteor", 774, { identificadorForma: "red-meteor", nomeForma: "Meteor Form" })],
    });
    expect(r.vagas[0]).toMatchObject({ id: "minior", forma: "Red Core", sprite: "10136" });
  });

  it("forma que fica fora não vira vaga nem aparece em semClassificacao", () => {
    const r = classificarFormasDex({
      especies: [especie(105, "marowak")],
      pokemons: [pokemon(105, 105), pokemon(10149, 105, false)],
      formas: [forma("marowak", 105), forma("marowak-totem", 10149)],
    });
    expect(r.vagas.map((v) => v.id)).toEqual(["marowak"]);
    expect(r.semClassificacao).toEqual([]);
  });
});

describe("shinyObtenivel — na dúvida, obtenível", () => {
  it("espécie sem shiny marca todas as suas formas", () => {
    expect(shinyObtenivel(720, "hoopa")).toBe(false);
    expect(shinyObtenivel(720, "hoopa-unbound")).toBe(false);
    expect(shinyObtenivel(892, "urshifu-rapid-strike")).toBe(false);
  });

  it("forma sem shiny não arrasta a espécie", () => {
    expect(shinyObtenivel(25, "pikachu-world-cap")).toBe(false);
    expect(shinyObtenivel(25, "pikachu")).toBe(true);
    expect(shinyObtenivel(25, "pikachu-partner-cap")).toBe(true);
  });

  it("Marshadow fica obtenível: fontes em conflito vão para o lado seguro", () => {
    expect(shinyObtenivel(802, "marshadow")).toBe(true);
  });
});
