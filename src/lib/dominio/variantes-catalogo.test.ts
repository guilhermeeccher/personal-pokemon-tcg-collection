import { describe, expect, it } from "vitest";

import {
  escolherVarianteDisponivel,
  semNenhumaVarianteMarcada,
  validarVariantesContraCatalogo,
  variantesDisponiveis,
  type FlagsVariantesCatalogo,
} from "./variantes-catalogo";

const SO_HOLO: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: false,
  varianteReverseDisponivel: false,
  varianteHoloDisponivel: true,
  variantePrimeiraEdicaoDisponivel: false,
  variantePromoDisponivel: false,
};

const NORMAL_E_REVERSE: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: true,
  varianteReverseDisponivel: true,
  varianteHoloDisponivel: false,
  variantePrimeiraEdicaoDisponivel: false,
  variantePromoDisponivel: false,
};

const NENHUMA: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: false,
  varianteReverseDisponivel: false,
  varianteHoloDisponivel: false,
  variantePrimeiraEdicaoDisponivel: false,
  variantePromoDisponivel: false,
};

describe("variantesDisponiveis", () => {
  it("caso Alakazam do Base Set: só holo disponível", () => {
    expect(variantesDisponiveis(SO_HOLO)).toEqual(["holo"]);
  });

  it("carta com mais de uma variante", () => {
    expect(variantesDisponiveis(NORMAL_E_REVERSE)).toEqual(["normal", "reverse"]);
  });

  it("catálogo sem nenhuma flag marcada: libera as cinco em vez de inventar 'normal'", () => {
    expect(variantesDisponiveis(NENHUMA)).toEqual([
      "normal",
      "reverse",
      "holo",
      "primeira_edicao",
      "promo",
    ]);
  });
});

describe("semNenhumaVarianteMarcada", () => {
  it("true quando todas as flags são false", () => {
    expect(semNenhumaVarianteMarcada(NENHUMA)).toBe(true);
  });
  it("false quando ao menos uma flag é true", () => {
    expect(semNenhumaVarianteMarcada(SO_HOLO)).toBe(false);
  });
});

describe("escolherVarianteDisponivel", () => {
  it("usa a desejada quando ela existe para a carta", () => {
    expect(escolherVarianteDisponivel("reverse", NORMAL_E_REVERSE)).toBe("reverse");
  });

  it("caso Alakazam: desejada 'normal' não existe -> cai para holo (a única disponível)", () => {
    expect(escolherVarianteDisponivel("normal", SO_HOLO)).toBe("holo");
  });

  it("sem nenhuma flag marcada, aceita a desejada (todas liberadas)", () => {
    expect(escolherVarianteDisponivel("promo", NENHUMA)).toBe("promo");
  });
});

describe("validarVariantesContraCatalogo", () => {
  it("sem erro quando toda variante escolhida está disponível", () => {
    const erros = validarVariantesContraCatalogo(
      [{ cartaId: "base1-1", variante: "holo" }],
      { "base1-1": ["holo"] },
    );
    expect(erros).toEqual([]);
  });

  it("critério do catálogo: Alakazam gravado como normal deve ser rejeitado", () => {
    const erros = validarVariantesContraCatalogo(
      [{ cartaId: "base1-1", variante: "normal" }],
      { "base1-1": ["holo"] },
    );
    expect(erros).toHaveLength(1);
    expect(erros[0].motivo).toContain("não existe no catálogo");
  });

  it("carta ausente do mapa (não encontrada no catálogo) também é erro", () => {
    const erros = validarVariantesContraCatalogo(
      [{ cartaId: "inexistente-1", variante: "normal" }],
      {},
    );
    expect(erros).toHaveLength(1);
    expect(erros[0].motivo).toContain("não encontrada");
  });

  it("acumula erros de vários itens", () => {
    const erros = validarVariantesContraCatalogo(
      [
        { cartaId: "base1-1", variante: "normal" },
        { cartaId: "base1-2", variante: "reverse" },
      ],
      { "base1-1": ["holo"], "base1-2": ["normal"] },
    );
    expect(erros).toHaveLength(2);
  });
});
