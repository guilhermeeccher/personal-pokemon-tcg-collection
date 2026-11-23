import { describe, expect, it } from "vitest";

import type { DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { MAX_QUANTIDADE_POR_LINHA } from "@/lib/dominio/dex-registro";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { FormaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import {
  ajustarQuantidade,
  comQuantidade,
  corpoDoLote,
  type FiltroCadastroDex,
  formasVisiveis,
  jogoEscolhido,
  lerRespostaCadastro,
  marcadasForaDaVista,
  quantidadeDoTexto,
  rotulosTrancadas,
  selosDaForma,
  totalDoLote,
} from "./lote-dex";

const TODAS: SecoesContadas = { regional: true, genero: true, especial: true };

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
    sprite: `${numero}`,
    ordem: numero * 10,
    lancamento: 1,
    ...extra,
  };
}

const BULBASAUR = forma("bulbasaur", 1, "Bulbasaur");
const PIKACHU = forma("pikachu", 25, "Pikachu");
const RAICHU_ALOLA = forma("raichu-alola", 26, "Raichu", { forma: "Alola", formaPt: "de Alola", categoria: "regional" });
const VIVILLON = forma("vivillon-meadow", 666, "Vivillon", { forma: "Meadow", categoria: "cosmetica" });
const FORMAS = [BULBASAUR, PIKACHU, RAICHU_ALOLA, VIVILLON];

const filtro = (extra: Partial<FiltroCadastroDex> = {}): FiltroCadastroDex => ({
  vista: "principal",
  busca: "",
  secoes: TODAS,
  catalogo: null,
  mostrarTodas: false,
  soQueNaoTenho: false,
  tenho: {},
  ...extra,
});

describe("quantidades", () => {
  it("só os dígitos contam, com o teto da rota", () => {
    expect(quantidadeDoTexto("")).toBe(0);
    expect(quantidadeDoTexto("3")).toBe(3);
    expect(quantidadeDoTexto(" 1-2 ")).toBe(12);
    expect(quantidadeDoTexto("1e3")).toBe(13);
    expect(quantidadeDoTexto("999")).toBe(MAX_QUANTIDADE_POR_LINHA);
    expect(quantidadeDoTexto("007")).toBe(7);
  });

  it("− e + ficam entre 0 e o teto", () => {
    expect(ajustarQuantidade(0, -1)).toBe(0);
    expect(ajustarQuantidade(2, 1)).toBe(3);
    expect(ajustarQuantidade(MAX_QUANTIDADE_POR_LINHA, 1)).toBe(MAX_QUANTIDADE_POR_LINHA);
  });

  it("uma forma que volta a zero nas duas trilhas sai do lote; nada muda, o mesmo objeto", () => {
    let q = comQuantidade({}, "pikachu", "normal", 2);
    q = comQuantidade(q, "pikachu", "shiny", 1);
    expect(q).toEqual({ pikachu: { normal: 2, shiny: 1 } });
    expect(comQuantidade(q, "pikachu", "normal", 2)).toBe(q);
    q = comQuantidade(q, "pikachu", "normal", 0);
    expect(q).toEqual({ pikachu: { normal: 0, shiny: 1 } });
    q = comQuantidade(q, "pikachu", "shiny", 0);
    expect(q).toEqual({});
  });

  it("o total conta cada unidade das duas trilhas, e o corpo é o da v1", () => {
    const q = { pikachu: { normal: 2, shiny: 1 }, bulbasaur: { normal: 0, shiny: 3 } };
    expect(totalDoLote(q)).toBe(6);
    expect(corpoDoLote("firered", q)).toEqual({
      jogoId: "firered",
      itens: [
        { formaId: "pikachu", normal: 2, shiny: 1 },
        { formaId: "bulbasaur", normal: 0, shiny: 3 },
      ],
    });
  });

  it("conta o que está no lote e não aparece na lista", () => {
    const q = { pikachu: { normal: 1, shiny: 0 }, "vivillon-meadow": { normal: 1, shiny: 0 } };
    expect(marcadasForaDaVista(q, [PIKACHU, BULBASAUR])).toBe(1);
    expect(marcadasForaDaVista(q, FORMAS)).toBe(0);
  });
});

describe("jogoEscolhido", () => {
  const opcoes = [{ id: "firered" }, { id: "sv-scarlet" }, { id: "home" }];
  it("o ?jogo= entre as opções vale; fora delas, a primeira", () => {
    expect(jogoEscolhido(opcoes, "sv-scarlet")).toBe("sv-scarlet");
    expect(jogoEscolhido(opcoes, "home")).toBe("home");
    expect(jogoEscolhido(opcoes, "go")).toBe("firered");
    expect(jogoEscolhido(opcoes, "")).toBe("firered");
  });
  it("sem jogo possuído, o HOME é a única opção", () => {
    expect(jogoEscolhido([{ id: "home" }], "firered")).toBe("home");
  });
});

describe("formasVisiveis", () => {
  it("a vista separa as cosméticas", () => {
    expect(formasVisiveis(FORMAS, filtro()).map((f) => f.id)).toEqual(["bulbasaur", "pikachu", "raichu-alola"]);
    expect(formasVisiveis(FORMAS, filtro({ vista: "cosmeticas" })).map((f) => f.id)).toEqual(["vivillon-meadow"]);
  });

  it("busca por número (o ?busca= da Pokédex) e pelo nome da forma em português", () => {
    expect(formasVisiveis(FORMAS, filtro({ busca: "25" })).map((f) => f.id)).toEqual(["pikachu"]);
    expect(formasVisiveis(FORMAS, filtro({ busca: "alola" })).map((f) => f.id)).toEqual(["raichu-alola"]);
    expect(formasVisiveis(FORMAS, filtro({ busca: "de alola" })).map((f) => f.id)).toEqual(["raichu-alola"]);
  });

  it("seção desligada some", () => {
    const secoes = { ...TODAS, regional: false };
    expect(formasVisiveis(FORMAS, filtro({ secoes })).map((f) => f.id)).toEqual(["bulbasaur", "pikachu"]);
  });

  it("o catálogo do jogo filtra, e 'Mostrar todas' abre o resto", () => {
    const catalogo = new Map<string, DisponibilidadeForma>([["pikachu", { como: "livre", transferivel: true }]]);
    expect(formasVisiveis(FORMAS, filtro({ catalogo })).map((f) => f.id)).toEqual(["pikachu"]);
    expect(formasVisiveis(FORMAS, filtro({ catalogo, mostrarTodas: true })).map((f) => f.id)).toEqual([
      "bulbasaur",
      "pikachu",
      "raichu-alola",
    ]);
  });

  it("'Só o que não tenho' tira a forma com qualquer registro", () => {
    const tenho = { pikachu: { normal: 0, shiny: 1 } };
    expect(formasVisiveis(FORMAS, filtro({ soQueNaoTenho: true, tenho })).map((f) => f.id)).toEqual([
      "bulbasaur",
      "raichu-alola",
    ]);
  });
});

function checkpoint(id: string, jogoId: string, libera: number[], titulo: string): TrofeuDexDTO {
  return {
    id,
    jogoId,
    tipo: "checkpoint",
    nivel: "prata",
    ordem: 1,
    textos: { "pt-BR": { titulo, descricao: "" }, en: { titulo: `${titulo} (en)`, descricao: "" } },
    requer: [],
    libera,
    regra: null,
    obtido: null,
  };
}

describe("rotulosTrancadas e selosDaForma", () => {
  const checkpoints = [
    checkpoint("fr-nacional", "firered", [25, 26], "Pokédex Nacional"),
    checkpoint("fr-ilhas", "firered", [26], "Ilhas Sevii"),
    checkpoint("lg-nacional", "leafgreen", [1], "Outro jogo"),
  ];

  it("só os checkpoints do jogo, no idioma, juntos por +", () => {
    const r = rotulosTrancadas(checkpoints, "firered", "pt-BR");
    expect(r.get(25)).toBe("Pokédex Nacional");
    expect(r.get(26)).toBe("Pokédex Nacional + Ilhas Sevii");
    expect(r.has(1)).toBe(false);
    expect(rotulosTrancadas(checkpoints, "firered", "en").get(25)).toBe("Pokédex Nacional (en)");
  });

  it("marca, nunca recusa: fora do jogo, troca, trancada, não vai ao HOME, sem shiny", () => {
    const catalogo = new Map<string, DisponibilidadeForma>([
      ["pikachu", { como: "troca", transferivel: false }],
      ["bulbasaur", { como: "livre", transferivel: true }],
    ]);
    const trancadas = rotulosTrancadas(checkpoints, "firered", "pt-BR");
    expect(selosDaForma(PIKACHU, catalogo, trancadas)).toEqual([
      { tipo: "como", como: "troca" },
      { tipo: "trancada", checkpoint: "Pokédex Nacional" },
      { tipo: "naoVaiAoHome" },
    ]);
    expect(selosDaForma(BULBASAUR, catalogo, trancadas)).toEqual([]);
    expect(selosDaForma({ ...RAICHU_ALOLA, shinyObtenivel: false }, catalogo, trancadas)).toEqual([
      { tipo: "foraDoJogo" },
      { tipo: "trancada", checkpoint: "Pokédex Nacional + Ilhas Sevii" },
      { tipo: "semShiny" },
    ]);
  });

  it("sem catálogo (o HOME), nada é 'fora do jogo'", () => {
    expect(selosDaForma(PIKACHU, null, new Map())).toEqual([]);
  });
});

describe("lerRespostaCadastro", () => {
  it("201 com os criados é gravado", () => {
    expect(lerRespostaCadastro(201, { ok: true, criados: 4 })).toEqual({ tipo: "gravado", criados: 4 });
  });
  it("2xx sem a contagem da rota é incerto", () => {
    expect(lerRespostaCadastro(200, null)).toEqual({ tipo: "incerto" });
    expect(lerRespostaCadastro(201, { criados: "4" })).toEqual({ tipo: "incerto" });
  });
  it("4xx é recusa: a rota, o acesso e o módulo recusam antes de gravar", () => {
    expect(lerRespostaCadastro(400, { recusas: [{ chave: "dexLocalNaoPossuido" }] })).toEqual({ tipo: "recusado" });
    expect(lerRespostaCadastro(400, { erro: "itens ausente ou vazio." })).toEqual({ tipo: "recusado" });
    expect(lerRespostaCadastro(404, null)).toEqual({ tipo: "recusado" });
  });
  it("5xx é incerto: a resposta pode ter se perdido depois do commit", () => {
    expect(lerRespostaCadastro(500, null)).toEqual({ tipo: "incerto" });
    expect(lerRespostaCadastro(502, { erro: "x" })).toEqual({ tipo: "incerto" });
  });
});
