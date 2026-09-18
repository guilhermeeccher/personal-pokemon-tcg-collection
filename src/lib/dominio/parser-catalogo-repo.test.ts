import { describe, expect, it } from "vitest";

import {
  calcularVariantesRepo,
  cartaDisponivelNoIdioma,
  converterCartaRepoParaDetalhada,
  converterSetRepoParaDetalhado,
  dataLancamentoNoIdioma,
  dexIdsValidos,
  setDisponivelNoIdioma,
  textoNoIdioma,
  type RepoCartaBruta,
  type RepoSetBruto,
} from "./parser-catalogo-repo";
import { paraLinha } from "../sync/catalogo";

// Fixtures abaixo são dados reais, copiados de arquivos do repositório
// `tcgdex/cards-database` (clone em 2026-08-26), não inventados — cada um
// cita o caminho de origem.

// data-asia/SM/SM3H.ts — o set que motivou o importador inteiro.
const SET_SM3H: RepoSetBruto = {
  id: "SM3H",
  name: { ja: "闘う虹を見たか", ko: "어둠을 밝힌 무지개" },
  serie: {
    id: "SM",
    name: { ja: "サン＆ムーン", "zh-cn": "太阳&月亮", ko: "썬&문" },
  },
  cardCount: { official: 51 },
  releaseDate: "2017-06-16",
};

// data-asia/SM/SM3H/009.ts — ヒトカゲ / Charmander.
const CARTA_SM3H_009: RepoCartaBruta = {
  name: { ja: "ヒトカゲ" },
  illustrator: "Kagemaru Himeno",
  category: "Pokemon",
  rarity: "Common",
  dexId: [4],
  variants: [{ type: "normal" }],
};

describe("textoNoIdioma", () => {
  it("retorna o texto direto no idioma pedido", () => {
    expect(textoNoIdioma(SET_SM3H.name, "ja")).toBe("闘う虹を見たか");
  });

  it("undefined quando o idioma não existe no objeto", () => {
    expect(textoNoIdioma(SET_SM3H.name, "en")).toBeUndefined();
  });

  it("undefined para texto ausente", () => {
    expect(textoNoIdioma(undefined, "ja")).toBeUndefined();
  });
});

describe("dataLancamentoNoIdioma", () => {
  it("string direta passa direto (data-asia/SM/SM3H.ts)", () => {
    expect(dataLancamentoNoIdioma("2017-06-16", "ja")).toBe("2017-06-16");
  });

  it("objeto multilíngue: usa o idioma pedido quando presente (data-asia/M/M-P.ts)", () => {
    expect(dataLancamentoNoIdioma({ ja: "2025-07-28" }, "ja")).toBe(
      "2025-07-28",
    );
  });

  it("objeto multilíngue sem o idioma pedido: cai para a primeira chave (data-asia/S/SC1a.ts)", () => {
    // Set sem nenhuma chave `ja` — não qualificaria para import (ver
    // setDisponivelNoIdioma), mas a função em si é genérica e testável
    // isolada, replicando o fallback do compilador da TCGdex.
    const releaseDate = {
      "zh-tw": "2020-06-19",
      id: "2020-11-21",
      th: "2020-09-08",
    };
    expect(dataLancamentoNoIdioma(releaseDate, "ja")).toBe("2020-06-19");
  });
});

describe("setDisponivelNoIdioma", () => {
  it("true quando set e série têm nome no idioma (SM3H)", () => {
    expect(setDisponivelNoIdioma(SET_SM3H, "ja")).toBe(true);
  });

  it("false quando a série não tem nome em nenhum idioma (achado real: BW1a, DP1a etc. gravam serie: { id: 'null', name: {} })", () => {
    const set: RepoSetBruto = {
      id: "BW1a",
      name: { ja: "ベストオブXY" },
      serie: { id: "null", name: {} },
      cardCount: { official: 100 },
      releaseDate: "2011-01-01",
    };
    expect(setDisponivelNoIdioma(set, "ja")).toBe(false);
  });

  it("false quando o set não tem nome no idioma pedido (data-asia/SV/CBB1C.ts, só zh-cn)", () => {
    const set: RepoSetBruto = {
      id: "CSV1C",
      name: { "zh-cn": "宝石包 第一卷" },
      serie: { id: "SV", name: { ja: "スカーレット&バイオレット" } },
      cardCount: { official: 9 },
      releaseDate: "2025-01-17",
    };
    expect(setDisponivelNoIdioma(set, "ja")).toBe(false);
  });
});

describe("cartaDisponivelNoIdioma", () => {
  it("true quando a carta tem nome no idioma (SM3H-009)", () => {
    expect(cartaDisponivelNoIdioma(CARTA_SM3H_009, "ja")).toBe(true);
  });

  it("false quando falta o nome no idioma", () => {
    expect(cartaDisponivelNoIdioma({ ...CARTA_SM3H_009, name: {} }, "ja")).toBe(
      false,
    );
  });
});

describe("dexIdsValidos", () => {
  it("mantém array de inteiros como está", () => {
    expect(dexIdsValidos([4])).toEqual([4]);
    expect(dexIdsValidos([643, 6])).toEqual([643, 6]);
  });

  it("undefined passa direto (Treinador/Energia)", () => {
    expect(dexIdsValidos(undefined)).toBeUndefined();
  });

  it("array vazio passa direto", () => {
    expect(dexIdsValidos([])).toEqual([]);
  });

  it("descarta valor fracionário (achado real: [384.1] em Rayquaza δ)", () => {
    expect(dexIdsValidos([384.1])).toEqual([]);
  });

  it("descarta só o valor fracionário quando misturado com inteiros válidos", () => {
    expect(dexIdsValidos([4, 384.1, 25])).toEqual([4, 25]);
  });
});

describe("calcularVariantesRepo", () => {
  it("array com uma variante normal só (SM3H-009): normal true, resto false", () => {
    expect(calcularVariantesRepo([{ type: "normal" }])).toEqual({
      normal: true,
      reverse: false,
      holo: false,
      firstEdition: false,
      wPromo: false,
    });
  });

  it("array com holo + holo com stamp hifenizado '1st-edition' (data-asia/VS/VS1/001.ts): holo e firstEdition true", () => {
    const variants = [{ type: "holo" }, { type: "holo", stamp: ["1st-edition"] }];
    expect(calcularVariantesRepo(variants)).toEqual({
      normal: false,
      reverse: false,
      holo: true,
      firstEdition: true,
      wPromo: false,
    });
  });

  it("achado real: stamp '1st edition' com espaço (data-asia/PCG/PCG1/001.ts) NÃO bate a comparação exata da API — firstEdition fica false", () => {
    const variants = [
      { type: "normal", stamp: ["1st edition"] },
      { type: "normal", subtype: "unlimited" },
    ];
    expect(calcularVariantesRepo(variants).firstEdition).toBe(false);
  });

  it("achado real: stamp '1st Edition' com maiúscula (data-asia/e/E5/001.ts) também não bate — firstEdition false", () => {
    const variants = [{ type: "normal" }, { type: "normal", stamp: ["1st Edition"] }];
    expect(calcularVariantesRepo(variants).firstEdition).toBe(false);
  });

  it("campo variants ausente (achado real: ~30% dos cards de data-asia, ex. data-asia/SV/SV8/095.ts): normal true por padrão, resto false — não 'nenhuma marcada'", () => {
    expect(calcularVariantesRepo(undefined)).toEqual({
      normal: true,
      reverse: false,
      holo: false,
      firstEdition: false,
      wPromo: false,
    });
  });

  it("objeto de flags legado (não visto em data-asia, mas suportado pelo tipo): respeita as flags explícitas", () => {
    expect(
      calcularVariantesRepo({ normal: false, holo: true, firstEdition: true }),
    ).toEqual({
      normal: false,
      reverse: false,
      holo: true,
      firstEdition: true,
      wPromo: false,
    });
  });
});

describe("converterSetRepoParaDetalhado", () => {
  it("SM3H: campos básicos e cardCount.total = max(official, contagem local)", () => {
    const detalhado = converterSetRepoParaDetalhado(SET_SM3H, "ja", 51);
    expect(detalhado.id).toBe("SM3H");
    expect(detalhado.name).toBe("闘う虹を見たか");
    expect(detalhado.serie).toEqual({ id: "SM", name: "サン＆ムーン" });
    expect(detalhado.cardCount).toEqual({ official: 51, total: 51 });
    expect(detalhado.releaseDate).toBe("2017-06-16");
    expect(detalhado.abbreviation).toBeUndefined();
  });

  it("achado real (data-asia/M/M-P.ts): cardCount.official pode ser 0 mesmo com cartas — total usa a contagem local", () => {
    const set: RepoSetBruto = {
      id: "M-P",
      name: { ja: "メガ プロモカード" },
      serie: { id: "M", name: { ja: "ポケモンカードゲーム MEGA" } },
      cardCount: { official: 0 },
      releaseDate: { ja: "2025-07-28" },
    };
    const detalhado = converterSetRepoParaDetalhado(set, "ja", 5);
    expect(detalhado.cardCount).toEqual({ official: 0, total: 5 });
    expect(detalhado.releaseDate).toBe("2025-07-28");
  });
});

describe("converterCartaRepoParaDetalhada + paraLinha — integração ponta a ponta", () => {
  it("SM3H-009 (ヒトカゲ/Charmander): a linha final bate com o que a conferência do banco espera", () => {
    const setDetalhado = converterSetRepoParaDetalhado(SET_SM3H, "ja", 51);
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "SM3H",
      "009",
      CARTA_SM3H_009,
      "ja",
    );
    const linha = paraLinha("jp", setDetalhado, cartaDetalhada);

    expect(linha).toMatchObject({
      id: "SM3H-009",
      idioma: "jp",
      setId: "SM3H",
      setNome: "闘う虹を見たか",
      setSerie: "サン＆ムーン",
      setSigla: null,
      localId: "009",
      nome: "ヒトカゲ",
      categoria: "Pokemon",
      raridade: "Common",
      dexIds: [4],
      forma: "normal",
      varianteNormalDisponivel: true,
      varianteReverseDisponivel: false,
      varianteHoloDisponivel: false,
      variantePrimeiraEdicaoDisponivel: false,
      variantePromoDisponivel: false,
      imagemUrl: null,
      ilustrador: "Kagemaru Himeno",
      setQtdOficial: 51,
      setQtdTotal: 51,
      ativa: true,
    });
  });

  it("localId preserva zeros à esquerda (nome do arquivo, não o número)", () => {
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "SM3H",
      "009",
      CARTA_SM3H_009,
      "ja",
    );
    expect(cartaDetalhada.localId).toBe("009");
    expect(cartaDetalhada.id).toBe("SM3H-009");
  });

  it("carta Treinador sem dexId (data-asia/M/M-P/005.ts): categoria Trainer, dexIds vazio", () => {
    const carta: RepoCartaBruta = {
      name: { ja: "あなあけスコップ" },
      illustrator: "Toyste Beach",
      category: "Trainer",
      rarity: "Promo",
      variants: [{ type: "normal" }],
    };
    const setDetalhado = converterSetRepoParaDetalhado(
      {
        id: "M-P",
        name: { ja: "メガ プロモカード" },
        serie: { id: "M", name: { ja: "ポケモンカードゲーム MEGA" } },
        cardCount: { official: 0 },
        releaseDate: { ja: "2025-07-28" },
      },
      "ja",
      1,
    );
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "M-P",
      "005",
      carta,
      "ja",
    );
    const linha = paraLinha("jp", setDetalhado, cartaDetalhada);
    expect(linha.categoria).toBe("Trainer");
    expect(linha.dexIds).toEqual([]);
  });

  it("carta multi-Pokémon (TAG TEAM, data-asia/SM/SM10/007.ts): dexIds com mais de um elemento — inelegível para vaga de Pokédex (regra de negócio 2, verificada em outro módulo)", () => {
    const carta: RepoCartaBruta = {
      name: { ja: "レシラム&リザードンGX" },
      illustrator: "Mitsuhiro Arita",
      category: "Pokemon",
      rarity: "Double rare",
      dexId: [643, 6],
      variants: [{ type: "holo" }],
    };
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "SM10",
      "007",
      carta,
      "ja",
    );
    expect(cartaDetalhada.dexId).toEqual([643, 6]);
    expect(cartaDetalhada.dexId).toHaveLength(2);
  });

  it("achado real: Rayquaza δ (data-asia/PCG/PCG6/043.ts) grava dexId: [384.1] — número fracionário, não um id real da Pokédex; descartado, não arredondado", () => {
    const carta: RepoCartaBruta = {
      name: { ja: "レイカザ（デルタ種）" },
      category: "Pokemon",
      rarity: "Holo Rare",
      dexId: [384.1],
      variants: [
        { type: "normal", subtype: "unlimited" },
        { type: "normal", stamp: ["1st edition"] },
      ],
    };
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "PCG6",
      "043",
      carta,
      "ja",
    );
    expect(cartaDetalhada.dexId).toEqual([]);
  });

  it("nome japonês não casa nenhum padrão de forma — vira 'normal' (comportamento correto, não um gap)", () => {
    const cartaDetalhada = converterCartaRepoParaDetalhada(
      "SM3H",
      "009",
      CARTA_SM3H_009,
      "ja",
    );
    const setDetalhado = converterSetRepoParaDetalhado(SET_SM3H, "ja", 51);
    const linha = paraLinha("jp", setDetalhado, cartaDetalhada);
    expect(linha.forma).toBe("normal");
  });
});
