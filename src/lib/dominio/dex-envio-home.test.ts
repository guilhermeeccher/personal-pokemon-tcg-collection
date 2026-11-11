import { describe, expect, it } from "vitest";

import {
  chaveVagaTrilha,
  lerLoteEnvioHome,
  MAX_ITENS_ENVIO_HOME,
  planejarEnvioHome,
  type CandidatoEnvioHome,
  type ContextoEnvioHome,
  type LoteEnvioHome,
  type PlanoEnvioHome,
} from "./dex-envio-home";

describe("lerLoteEnvioHome", () => {
  const corpo = { jogoOrigem: "go", itens: [{ formaId: "bulbasaur", shiny: false }] };

  it("lê o lote; sem confirmarSemVolta, ela é falsa", () => {
    expect(lerLoteEnvioHome(corpo)).toEqual({
      jogoOrigem: "go",
      itens: [{ formaId: "bulbasaur", shiny: false }],
      confirmarSemVolta: false,
    });
    expect(lerLoteEnvioHome({ ...corpo, confirmarSemVolta: true })).toMatchObject({ confirmarSemVolta: true });
  });

  it("descarta campos a mais do item", () => {
    expect(lerLoteEnvioHome({ ...corpo, itens: [{ formaId: "bulbasaur", shiny: true, normal: 3 }] })).toMatchObject({
      itens: [{ formaId: "bulbasaur", shiny: true }],
    });
  });

  it("recusa corpo que não é objeto, ou sem jogo de saída", () => {
    expect(typeof lerLoteEnvioHome(undefined)).toBe("string");
    expect(typeof lerLoteEnvioHome("go")).toBe("string");
    expect(typeof lerLoteEnvioHome({ itens: corpo.itens })).toBe("string");
    expect(typeof lerLoteEnvioHome({ ...corpo, jogoOrigem: "" })).toBe("string");
  });

  it("recusa itens ausentes, vazios ou acima do teto", () => {
    const item = (n: number) => ({ formaId: `f${n}`, shiny: false });
    expect(typeof lerLoteEnvioHome({ jogoOrigem: "go" })).toBe("string");
    expect(typeof lerLoteEnvioHome({ jogoOrigem: "go", itens: [] })).toBe("string");
    expect(typeof lerLoteEnvioHome({ jogoOrigem: "go", itens: {} })).toBe("string");
    const noTeto = Array.from({ length: MAX_ITENS_ENVIO_HOME }, (_, n) => item(n));
    expect(typeof lerLoteEnvioHome({ jogoOrigem: "go", itens: noTeto })).toBe("object");
    expect(typeof lerLoteEnvioHome({ jogoOrigem: "go", itens: [...noTeto, item(MAX_ITENS_ENVIO_HOME)] })).toBe(
      "string",
    );
  });

  it("recusa item malformado", () => {
    for (const itens of [[null], [7], [{ shiny: false }], [{ formaId: "", shiny: false }], [{ formaId: "x" }], [{ formaId: "x", shiny: "sim" }]]) {
      expect(typeof lerLoteEnvioHome({ jogoOrigem: "go", itens })).toBe("string");
    }
  });

  it("recusa confirmarSemVolta que não é boolean", () => {
    expect(typeof lerLoteEnvioHome({ ...corpo, confirmarSemVolta: "true" })).toBe("string");
  });

  it("um item por vaga e trilha: a mesma forma normal e shiny passa, repetida não", () => {
    expect(
      lerLoteEnvioHome({
        jogoOrigem: "go",
        itens: [
          { formaId: "pikachu", shiny: false },
          { formaId: "pikachu", shiny: true },
        ],
      }),
    ).toMatchObject({ itens: [{ shiny: false }, { shiny: true }] });
    expect(
      lerLoteEnvioHome({
        jogoOrigem: "go",
        itens: [
          { formaId: "pikachu", shiny: true },
          { formaId: "pikachu", shiny: true },
        ],
      }),
    ).toMatch(/repetido/);
  });
});

describe("planejarEnvioHome", () => {
  const ctx: ContextoEnvioHome = {
    formasAtivas: new Set(["bulbasaur", "pikachu", "raichu-alola", "spinda", "pikachu-cap-original"]),
    jogosAtivos: new Set(["go", "firered", "sword", "scarlet", "lets-go-pikachu"]),
    naoTransferiveis: new Set(["go:spinda"]),
    formasSemShiny: new Set(["pikachu-cap-original"]),
    vagasNoHome: new Set([chaveVagaTrilha("bulbasaur", true)]),
  };

  const lote = (jogoOrigem: string, itens: LoteEnvioHome["itens"], confirmarSemVolta = false): LoteEnvioHome => ({
    jogoOrigem,
    itens,
    confirmarSemVolta,
  });
  const normal = (formaId: string) => ({ formaId, shiny: false });
  const shiny = (formaId: string) => ({ formaId, shiny: true });
  const cand = (id: string, formaId: string, jogoOrigem: string, local: string, eShiny = false): CandidatoEnvioHome => ({
    id,
    formaId,
    shiny: eShiny,
    jogoOrigem,
    local,
  });
  const novo = (formaId: string, jogoOrigem: string, eShiny = false) => ({
    formaId,
    shiny: eShiny,
    jogoOrigem,
    local: "home",
    capturadoEm: null,
    notas: null,
  });
  const chaves = (p: PlanoEnvioHome) => ("recusas" in p ? p.recusas.map((r) => r.chave) : []);

  it("sem registro no jogo de saída, cria no HOME com origem = saída", () => {
    expect(planejarEnvioHome(lote("scarlet", [normal("pikachu")]), [], ctx)).toEqual({
      ok: true,
      criar: [novo("pikachu", "scarlet")],
      mover: [],
    });
  });

  it("move o registro que está no jogo de saída, e a origem histórica fica com ele", () => {
    // Nascido no Sword, hoje no Scarlet: sai do Scarlet e continua "do Sword".
    const p = planejarEnvioHome(lote("scarlet", [normal("pikachu")]), [cand("r1", "pikachu", "sword", "scarlet")], ctx);
    expect(p).toEqual({ ok: true, criar: [], mover: ["r1"] });
  });

  it("move o mais antigo primeiro (a ordem recebida)", () => {
    const p = planejarEnvioHome(
      lote("scarlet", [normal("pikachu")]),
      [cand("antigo", "pikachu", "scarlet", "scarlet"), cand("novo", "pikachu", "scarlet", "scarlet")],
      ctx,
    );
    expect(p).toEqual({ ok: true, criar: [], mover: ["antigo"] });
  });

  it("candidato em outro jogo não é movido: cria um novo vindo da saída", () => {
    const p = planejarEnvioHome(lote("scarlet", [normal("pikachu")]), [cand("r1", "pikachu", "sword", "sword")], ctx);
    expect(p).toEqual({ ok: true, criar: [novo("pikachu", "scarlet")], mover: [] });
  });

  it("candidato da outra trilha não é movido", () => {
    const p = planejarEnvioHome(
      lote("scarlet", [normal("pikachu")]),
      [cand("r1", "pikachu", "scarlet", "scarlet", true)],
      ctx,
    );
    expect(p).toEqual({ ok: true, criar: [novo("pikachu", "scarlet")], mover: [] });
  });

  it("lote misto normal e shiny da mesma forma: cada trilha decide por si", () => {
    const p = planejarEnvioHome(
      lote("scarlet", [normal("pikachu"), shiny("pikachu")]),
      [cand("r1", "pikachu", "scarlet", "scarlet")],
      ctx,
    );
    expect(p).toEqual({ ok: true, criar: [novo("pikachu", "scarlet", true)], mover: ["r1"] });
  });

  it("saída pelo HOME sempre cria, com origem e local home", () => {
    const p = planejarEnvioHome(
      lote("home", [normal("pikachu"), shiny("raichu-alola")]),
      [cand("r1", "pikachu", "scarlet", "scarlet")],
      ctx,
    );
    expect(p).toEqual({
      ok: true,
      criar: [novo("pikachu", "home"), novo("raichu-alola", "home", true)],
      mover: [],
    });
  });

  it("Let's Go como saída funciona como qualquer jogo de ida e volta", () => {
    const p = planejarEnvioHome(
      lote("lets-go-pikachu", [normal("pikachu"), normal("bulbasaur")]),
      [cand("r1", "pikachu", "lets-go-pikachu", "lets-go-pikachu")],
      ctx,
    );
    expect(p).toEqual({ ok: true, criar: [novo("bulbasaur", "lets-go-pikachu")], mover: ["r1"] });
  });

  it("não olha o catálogo do jogo: forma que a saída não tem (veio por troca) passa", () => {
    const p = planejarEnvioHome(lote("firered", [normal("raichu-alola")], true), [], ctx);
    expect(p).toEqual({ ok: true, criar: [novo("raichu-alola", "firered")], mover: [] });
  });

  it("recusa forma fora do catálogo ativo", () => {
    expect(chaves(planejarEnvioHome(lote("scarlet", [normal("missingno")]), [], ctx))).toEqual([
      "dexFormaDesconhecida",
    ]);
  });

  it("recusa shiny de forma sem shiny; a normal da mesma forma passa", () => {
    expect(chaves(planejarEnvioHome(lote("scarlet", [shiny("pikachu-cap-original")]), [], ctx))).toEqual([
      "dexSemShiny",
    ]);
    expect(planejarEnvioHome(lote("scarlet", [normal("pikachu-cap-original")]), [], ctx).ok).toBe(true);
  });

  it("recusa vaga que já está no HOME naquela trilha; a outra trilha passa", () => {
    const p = planejarEnvioHome(lote("scarlet", [shiny("bulbasaur")]), [], ctx);
    expect(p).toEqual({
      ok: false,
      recusas: [{ chave: "dexVagaJaNoHome", valores: { forma: "bulbasaur", trilha: "shiny" } }],
    });
    expect(planejarEnvioHome(lote("scarlet", [normal("bulbasaur")]), [], ctx).ok).toBe(true);
  });

  it("recusa saída fora do catálogo de jogos", () => {
    expect(chaves(planejarEnvioHome(lote("stadium", [normal("pikachu")]), [], ctx))).toEqual(["dexJogoDesconhecido"]);
  });

  it("recusa saída de jogo que o usuário não tem, ou parou", () => {
    const p = planejarEnvioHome(lote("violet", [normal("pikachu")]), [cand("r1", "pikachu", "violet", "violet")], ctx);
    expect(p).toEqual({ ok: false, recusas: [{ chave: "dexLocalNaoPossuido", valores: { jogo: "Pokémon Violet" } }] });
  });

  it("Spinda do GO é recusado, criado ou movido", () => {
    const criado = planejarEnvioHome(lote("go", [normal("spinda")], true), [], ctx);
    expect(chaves(criado)).toEqual(["dexNaoTransferivel"]);
    const movido = planejarEnvioHome(lote("go", [normal("spinda")], true), [cand("r1", "spinda", "go", "go")], ctx);
    expect(chaves(movido)).toEqual(["dexNaoTransferivel"]);
  });

  it("a restrição é do jogo de saída: Spinda do Sword vai, mesmo nascido no GO", () => {
    const p = planejarEnvioHome(lote("sword", [normal("spinda")]), [cand("r1", "spinda", "go", "sword")], ctx);
    expect(p).toEqual({ ok: true, criar: [], mover: ["r1"] });
  });

  it("saída só de envio pede confirmação, uma vez para o lote inteiro", () => {
    const p = planejarEnvioHome(
      lote("go", [normal("pikachu"), shiny("pikachu"), normal("bulbasaur")]),
      [cand("r1", "pikachu", "go", "go")],
      ctx,
    );
    expect(p).toEqual({
      ok: false,
      confirmacao: { chave: "dexConfirmarSemVolta", valores: { jogo: "Pokémon GO" } },
    });
    expect(
      planejarEnvioHome(
        lote("go", [normal("pikachu"), shiny("pikachu"), normal("bulbasaur")], true),
        [cand("r1", "pikachu", "go", "go")],
        ctx,
      ),
    ).toEqual({
      ok: true,
      criar: [novo("pikachu", "go", true), novo("bulbasaur", "go")],
      mover: ["r1"],
    });
  });

  it("confirmação só depois das recusas de verdade", () => {
    expect(chaves(planejarEnvioHome(lote("go", [normal("pikachu"), normal("spinda")]), [], ctx))).toEqual([
      "dexNaoTransferivel",
    ]);
    const semJogo = { ...ctx, jogosAtivos: new Set(["scarlet"]) };
    expect(chaves(planejarEnvioHome(lote("go", [normal("pikachu")]), [], semJogo))).toEqual(["dexLocalNaoPossuido"]);
  });

  it("junta todas as recusas, sem repetir", () => {
    const p = planejarEnvioHome(
      lote(
        "go",
        [normal("spinda"), shiny("spinda"), normal("missingno"), shiny("bulbasaur"), shiny("pikachu-cap-original")],
        true,
      ),
      [],
      ctx,
    );
    expect(chaves(p)).toEqual(["dexNaoTransferivel", "dexFormaDesconhecida", "dexVagaJaNoHome", "dexSemShiny"]);
  });

  it("nada é planejado quando há recusa", () => {
    const p = planejarEnvioHome(lote("scarlet", [normal("pikachu"), normal("missingno")]), [], ctx);
    expect(p.ok).toBe(false);
    expect("criar" in p).toBe(false);
  });
});
