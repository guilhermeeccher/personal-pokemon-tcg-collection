import { describe, expect, it } from "vitest";

import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import {
  destinosDoGrupo,
  FILTROS_INVENTARIO_VAZIOS,
  filtrosNoPainel,
  idParaApagar,
  idParaMover,
  linhasDoInventario,
  totalDePokemon,
} from "./linhas-inventario";

function forma(id: string, numero: number, especie: string, extra: Partial<FormaDexDTO> = {}): FormaDexDTO {
  return {
    id,
    numero,
    especie,
    forma: null,
    formaPt: null,
    categoria: "base",
    geracao: 1,
    lendario: false,
    mitico: false,
    shinyObtenivel: true,
    sprite: id,
    ordem: numero * 10,
    lancamento: 1,
    ...extra,
  };
}

let seq = 0;
function registro(formaId: string, extra: Partial<RegistroDexDTO> = {}): RegistroDexDTO {
  seq += 1;
  return {
    id: `r${seq}`,
    formaId,
    shiny: false,
    jogoOrigem: "scarlet",
    local: "scarlet",
    capturadoEm: null,
    notas: null,
    aGuardar: false,
    atualizadoEm: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

function jogo(jogoId: string, ativo = true): JogoPossuidoDTO {
  return { id: `j-${jogoId}`, jogoId, nome: jogoId, conexaoHome: "ida_e_volta", desde: null, notas: null, ativo, registrosAqui: 0 };
}

const FORMAS = [
  forma("raichu", 26, "Raichu"),
  forma("raichu-alola", 26, "Raichu", { forma: "Alola", formaPt: "de Alola", categoria: "regional", ordem: 261 }),
  forma("bulbasaur", 1, "Bulbasaur"),
  forma("flabebe", 669, "Flabébé"),
];

describe("linhasDoInventario", () => {
  it("agrupa registros idênticos em tudo menos o id, e ordena por nome, base antes da forma", () => {
    seq = 0;
    const registros = [
      registro("raichu-alola"),
      registro("raichu"),
      registro("raichu"),
      registro("flabebe", { local: "home" }),
      registro("bulbasaur"),
    ];
    const linhas = linhasDoInventario(registros, FORMAS, FILTROS_INVENTARIO_VAZIOS);
    expect(linhas.map((l) => [l.forma.id, l.grupo.ids])).toEqual([
      ["bulbasaur", ["r5"]],
      ["flabebe", ["r4"]],
      ["raichu", ["r2", "r3"]],
      ["raichu-alola", ["r1"]],
    ]);
    expect(totalDePokemon(linhas)).toBe(5);
  });

  it("um campo diferente (shiny, origem, local, data, notas) separa o grupo", () => {
    seq = 0;
    const registros = [
      registro("raichu"),
      registro("raichu", { shiny: true }),
      registro("raichu", { jogoOrigem: "go" }),
      registro("raichu", { local: "home" }),
      registro("raichu", { capturadoEm: "2026-01-02" }),
      registro("raichu", { notas: "troca" }),
    ];
    expect(linhasDoInventario(registros, FORMAS, FILTROS_INVENTARIO_VAZIOS)).toHaveLength(6);
  });

  it("filtra por lugar, por shiny e pela busca da Pokédex (nome, forma em pt, número)", () => {
    seq = 0;
    const registros = [
      registro("raichu", { local: "home" }),
      registro("raichu-alola", { shiny: true }),
      registro("bulbasaur", { shiny: true, local: "home" }),
    ];
    const ids = (f: Partial<typeof FILTROS_INVENTARIO_VAZIOS>) =>
      linhasDoInventario(registros, FORMAS, { ...FILTROS_INVENTARIO_VAZIOS, ...f }).map((l) => l.forma.id);
    expect(ids({ local: "home" })).toEqual(["bulbasaur", "raichu"]);
    expect(ids({ soShiny: true })).toEqual(["bulbasaur", "raichu-alola"]);
    expect(ids({ local: "home", soShiny: true })).toEqual(["bulbasaur"]);
    expect(ids({ busca: "alola" })).toEqual(["raichu-alola"]);
    expect(ids({ busca: "de alola" })).toEqual(["raichu-alola"]);
    expect(ids({ busca: "#26" })).toEqual(["raichu", "raichu-alola"]);
    expect(ids({ busca: "flabebe" })).toEqual([]);
    expect(ids({ busca: "   " })).toEqual(["bulbasaur", "raichu", "raichu-alola"]);
  });

  it("um registro cuja vaga saiu do catálogo não vira linha", () => {
    seq = 0;
    const linhas = linhasDoInventario([registro("sumiu"), registro("raichu")], FORMAS, FILTROS_INVENTARIO_VAZIOS);
    expect(linhas.map((l) => l.forma.id)).toEqual(["raichu"]);
  });
});

describe("filtrosNoPainel", () => {
  it("conta o lugar e o só shiny, nunca a busca", () => {
    expect(filtrosNoPainel(FILTROS_INVENTARIO_VAZIOS)).toBe(0);
    expect(filtrosNoPainel({ local: "", busca: "pika", soShiny: false })).toBe(0);
    expect(filtrosNoPainel({ local: "home", busca: "", soShiny: true })).toBe(2);
  });
});

describe("destinosDoGrupo", () => {
  const jogos = [jogo("scarlet"), jogo("go"), jogo("sword", false)];

  it("o HOME e os jogos ativos, menos onde o grupo já está; jogo parado fica de fora", () => {
    expect(destinosDoGrupo("scarlet", jogos)).toEqual(["home", "go"]);
    expect(destinosDoGrupo("home", jogos)).toEqual(["scarlet", "go"]);
  });

  it("um grupo num jogo parado ainda pode sair dele", () => {
    expect(destinosDoGrupo("sword", jogos)).toEqual(["home", "scarlet", "go"]);
  });
});

describe("qual Pokémon do grupo cada ação toca", () => {
  const grupo = {
    chave: "k",
    formaId: "raichu",
    shiny: false,
    jogoOrigem: "scarlet",
    local: "scarlet",
    capturadoEm: null,
    notas: null,
    ids: ["antigo", "meio", "novo"],
  };
  it("mover leva o mais antigo; apagar apaga o mais novo — um só, nunca o grupo", () => {
    expect(idParaMover(grupo)).toBe("antigo");
    expect(idParaApagar(grupo)).toBe("novo");
  });
});
