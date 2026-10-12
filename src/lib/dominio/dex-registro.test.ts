import { describe, expect, it } from "vitest";

import {
  ehPedidoDeConfirmacao,
  lerDadosRegistro,
  validarMovimento,
  validarNovoRegistro,
  type DadosRegistroDex,
} from "./dex-registro";

const ctx = {
  formasAtivas: new Set(["bulbasaur", "raichu-alola", "pikachu"]),
  jogosAtivos: new Set(["go", "firered", "brilliant-diamond", "lets-go-pikachu"]),
};

const base: DadosRegistroDex = {
  formaId: "bulbasaur",
  shiny: false,
  jogoOrigem: "firered",
  local: "firered",
  capturadoEm: null,
  notas: null,
};

const chaves = (rs: { chave: string }[]) => rs.map((r) => r.chave);

describe("validarNovoRegistro", () => {
  it("aceita um Pokémon pego no FireRed e ainda nele", () => {
    expect(validarNovoRegistro(base, ctx)).toEqual([]);
  });

  it("aceita registrar direto no HOME", () => {
    expect(validarNovoRegistro({ ...base, local: "home" }, ctx)).toEqual([]);
  });

  it("recusa forma fora do catálogo ativo", () => {
    expect(chaves(validarNovoRegistro({ ...base, formaId: "missingno" }, ctx))).toEqual(["dexFormaDesconhecida"]);
  });

  it("recusa jogo de origem fora do catálogo", () => {
    expect(chaves(validarNovoRegistro({ ...base, jogoOrigem: "pokemon-stadium" }, ctx))).toEqual([
      "dexJogoDesconhecido",
    ]);
  });

  it("aceita origem num jogo que o usuário não tem (veio por troca), com local no HOME", () => {
    expect(validarNovoRegistro({ ...base, jogoOrigem: "violet", local: "home" }, ctx)).toEqual([]);
  });

  it("recusa local num jogo que o usuário não tem", () => {
    expect(chaves(validarNovoRegistro({ ...base, jogoOrigem: "violet", local: "violet" }, ctx))).toEqual([
      "dexLocalNaoPossuido",
    ]);
  });

  it("nada entra num jogo só de envio: origem BD, local FireRed é recusado", () => {
    expect(
      chaves(validarNovoRegistro({ ...base, jogoOrigem: "brilliant-diamond", local: "firered" }, ctx)),
    ).toEqual(["dexNadaEntraEmSoEnvio"]);
  });

  it("Let's Go só guarda Pokémon de Let's Go", () => {
    expect(
      chaves(validarNovoRegistro({ ...base, jogoOrigem: "brilliant-diamond", local: "lets-go-pikachu" }, ctx)),
    ).toEqual(["dexLetsGoSoDoProprio"]);
  });

  it("recusa data que não existe", () => {
    expect(chaves(validarNovoRegistro({ ...base, capturadoEm: "2026-02-30" }, ctx))).toEqual(["dexDataInvalida"]);
  });

  it("devolve todas as recusas juntas", () => {
    expect(
      chaves(validarNovoRegistro({ ...base, formaId: "x", capturadoEm: "ontem" }, ctx)),
    ).toEqual(["dexFormaDesconhecida", "dexDataInvalida"]);
  });
});

describe("validarMovimento", () => {
  it("sair do FireRed para o HOME pede confirmação", () => {
    const r = validarMovimento(
      { jogoOrigem: "firered", localAtual: "firered", novoLocal: "home", confirmarSemVolta: false },
      ctx,
    );
    expect(ehPedidoDeConfirmacao(r)).toBe(true);
    expect(r?.valores).toEqual({ jogo: "Pokémon FireRed" });
  });

  it("com a confirmação, o FireRed manda para o HOME", () => {
    expect(
      validarMovimento({ jogoOrigem: "firered", localAtual: "firered", novoLocal: "home", confirmarSemVolta: true }, ctx),
    ).toBeNull();
  });

  it("do GO para o HOME também pede confirmação", () => {
    expect(
      ehPedidoDeConfirmacao(
        validarMovimento({ jogoOrigem: "go", localAtual: "go", novoLocal: "home", confirmarSemVolta: false }, ctx),
      ),
    ).toBe(true);
  });

  it("do HOME de volta ao FireRed é recusado, mesmo sendo a origem", () => {
    const r = validarMovimento(
      { jogoOrigem: "firered", localAtual: "home", novoLocal: "firered", confirmarSemVolta: true },
      ctx,
    );
    expect(r?.chave).toBe("dexNadaEntraEmSoEnvio");
  });

  it("jogo de ida e volta move sem confirmação, nos dois sentidos", () => {
    expect(
      validarMovimento(
        { jogoOrigem: "brilliant-diamond", localAtual: "brilliant-diamond", novoLocal: "home", confirmarSemVolta: false },
        ctx,
      ),
    ).toBeNull();
    expect(
      validarMovimento(
        { jogoOrigem: "go", localAtual: "home", novoLocal: "brilliant-diamond", confirmarSemVolta: false },
        ctx,
      ),
    ).toBeNull();
  });

  it("destino inválido recusa antes de pedir confirmação", () => {
    const r = validarMovimento(
      { jogoOrigem: "firered", localAtual: "firered", novoLocal: "violet", confirmarSemVolta: false },
      ctx,
    );
    expect(r?.chave).toBe("dexLocalNaoPossuido");
  });

  it("mover para onde já está não é movimento", () => {
    expect(
      validarMovimento({ jogoOrigem: "firered", localAtual: "firered", novoLocal: "firered", confirmarSemVolta: false }, ctx),
    ).toBeNull();
  });
});

describe("lerDadosRegistro", () => {
  it("normaliza texto vazio para nulo e apara as notas", () => {
    expect(
      lerDadosRegistro({ formaId: "bulbasaur", shiny: false, jogoOrigem: "go", local: "go", capturadoEm: "", notas: "  Pokéstop  " }),
    ).toEqual({ formaId: "bulbasaur", shiny: false, jogoOrigem: "go", local: "go", capturadoEm: null, notas: "Pokéstop" });
  });

  it("devolve a frase do problema para corpo malformado", () => {
    expect(lerDadosRegistro({ formaId: "bulbasaur", shiny: "sim", jogoOrigem: "go", local: "go" })).toMatch(/shiny/);
    expect(lerDadosRegistro({ shiny: false })).toMatch(/formaId/);
    expect(lerDadosRegistro(null)).toMatch(/Corpo/);
  });
});
