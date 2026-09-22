import { describe, expect, it } from "vitest";

import type { CopiaComparavel } from "./melhoria-vaga";
import {
  ehMelhoria,
  eixoDaMelhoria,
  ordenarCandidatas,
  pontuarCopia,
  selecionarMelhorias,
} from "./melhoria-vaga";

/** Cópia comum, em português, normal — o piso da escada. */
function copia(patch: Partial<CopiaComparavel> = {}): CopiaComparavel {
  return { raridade: "Comum", idioma: "pt", variante: "normal", ...patch };
}

describe("pontuarCopia", () => {
  it("usa as mesmas cinco classes de raridade da tela", () => {
    expect(pontuarCopia(copia({ raridade: "Comum" }))!.raridade).toBe(0);
    expect(pontuarCopia(copia({ raridade: "Incomum" }))!.raridade).toBe(1);
    expect(pontuarCopia(copia({ raridade: "Rara" }))!.raridade).toBe(2);
    expect(pontuarCopia(copia({ raridade: "Rara Holo" }))!.raridade).toBe(3);
    expect(pontuarCopia(copia({ raridade: "Ilustração Rara Especial" }))!.raridade).toBe(4);
  });

  it("ordena o idioma como o usuário pediu: en > jp > pt", () => {
    const pt = pontuarCopia(copia({ idioma: "pt" }))!.idioma;
    const jp = pontuarCopia(copia({ idioma: "jp" }))!.idioma;
    const en = pontuarCopia(copia({ idioma: "en" }))!.idioma;
    expect(en).toBeGreaterThan(jp);
    expect(jp).toBeGreaterThan(pt);
  });

  it("ordena a variante: normal < reverse < holo < 1ª edição", () => {
    const normal = pontuarCopia(copia({ variante: "normal" }))!.variante;
    const reverse = pontuarCopia(copia({ variante: "reverse" }))!.variante;
    const holo = pontuarCopia(copia({ variante: "holo" }))!.variante;
    const primeira = pontuarCopia(copia({ variante: "primeira_edicao" }))!.variante;
    expect(reverse).toBeGreaterThan(normal);
    expect(holo).toBeGreaterThan(reverse);
    expect(primeira).toBeGreaterThan(holo);
  });

  it("devolve null para promo — por decisão, fora da escada", () => {
    expect(pontuarCopia(copia({ variante: "promo" }))).toBeNull();
  });

  it("raridade desconhecida ou ausente cai no piso, nunca em chute", () => {
    expect(pontuarCopia(copia({ raridade: null }))!.raridade).toBe(0);
    expect(pontuarCopia(copia({ raridade: "Coisa Que Não Existe" }))!.raridade).toBe(0);
  });
});

describe("eixoDaMelhoria", () => {
  it("é o caso que originou a feature: secreta livre contra comum alocada", () => {
    // Ampharos CRI 90/86 (secreta) livre; vaga 181 com um Ampharos comum.
    const alocada = copia({ raridade: "Comum", idioma: "en" });
    const candidata = copia({ raridade: "Ultra Rara", idioma: "pt" });
    expect(eixoDaMelhoria(alocada, candidata)).toBe("raridade");
  });

  it("raridade é peso 1 e não se compensa com idioma nem variante", () => {
    // Comum inglesa 1ª edição NÃO supera uma secreta portuguesa normal:
    // se os eixos somassem pontos, esta seria a troca errada sugerida.
    const alocada = copia({ raridade: "Ultra Rara", idioma: "pt", variante: "normal" });
    const candidata = copia({ raridade: "Comum", idioma: "en", variante: "primeira_edicao" });
    expect(eixoDaMelhoria(alocada, candidata)).toBeNull();
  });

  it("com a mesma raridade, o idioma decide", () => {
    const alocada = copia({ raridade: "Rara", idioma: "pt" });
    const candidata = copia({ raridade: "Rara", idioma: "en" });
    expect(eixoDaMelhoria(alocada, candidata)).toBe("idioma");
  });

  it("português não substitui inglês — a escada não é reversível", () => {
    const alocada = copia({ raridade: "Rara", idioma: "en" });
    const candidata = copia({ raridade: "Rara", idioma: "pt" });
    expect(eixoDaMelhoria(alocada, candidata)).toBeNull();
  });

  it("com raridade e idioma iguais, a variante decide — o caso da coleção de set", () => {
    // "tenho a normal alocada e uma reverse disponível" (2026-09-05).
    const alocada = copia({ variante: "normal" });
    const candidata = copia({ variante: "reverse" });
    expect(eixoDaMelhoria(alocada, candidata)).toBe("variante");
  });

  it("empate perfeito não sugere nada", () => {
    expect(eixoDaMelhoria(copia(), copia())).toBeNull();
  });

  it("promo não é sugerida como melhoria", () => {
    const alocada = copia({ raridade: "Comum" });
    const candidata = copia({ raridade: "Ultra Rara", variante: "promo" });
    expect(eixoDaMelhoria(alocada, candidata)).toBeNull();
  });

  it("vaga preenchida com promo nunca é sinalizada para troca", () => {
    const alocada = copia({ raridade: "Comum", variante: "promo" });
    const candidata = copia({ raridade: "Ultra Rara", variante: "holo" });
    expect(eixoDaMelhoria(alocada, candidata)).toBeNull();
  });

  it("ehMelhoria concorda com eixoDaMelhoria", () => {
    const alocada = copia();
    expect(ehMelhoria(alocada, copia({ raridade: "Rara" }))).toBe(true);
    expect(ehMelhoria(alocada, copia())).toBe(false);
  });
});

describe("ordenarCandidatas", () => {
  it("ordena da melhor para a pior, respeitando a hierarquia dos eixos", () => {
    const comumEn = copia({ raridade: "Comum", idioma: "en" });
    const raraPt = copia({ raridade: "Rara", idioma: "pt" });
    const raraEn = copia({ raridade: "Rara", idioma: "en" });
    const raraEnReverse = copia({ raridade: "Rara", idioma: "en", variante: "reverse" });

    expect(ordenarCandidatas([comumEn, raraPt, raraEnReverse, raraEn])).toEqual([
      raraEnReverse,
      raraEn,
      raraPt,
      comumEn,
    ]);
  });

  it("empate mantém a ordem de entrada — não invento desempate", () => {
    const a = { ...copia(), id: "a" };
    const b = { ...copia(), id: "b" };
    expect(ordenarCandidatas([a, b]).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("selecionarMelhorias", () => {
  it("descarta o que não é melhoria e devolve o eixo de cada uma que sobrou", () => {
    const alocada = copia({ raridade: "Rara", idioma: "pt", variante: "normal" });
    const pior = { ...copia({ raridade: "Comum", idioma: "en" }), id: "pior" };
    const igual = { ...alocada, id: "igual" };
    const porIdioma = { ...copia({ raridade: "Rara", idioma: "en" }), id: "idioma" };
    const porRaridade = { ...copia({ raridade: "Rara Holo", idioma: "pt" }), id: "raridade" };
    const porVariante = {
      ...copia({ raridade: "Rara", idioma: "pt", variante: "reverse" }),
      id: "variante",
    };

    const resultado = selecionarMelhorias(alocada, [
      pior,
      igual,
      porIdioma,
      porRaridade,
      porVariante,
    ]);

    expect(resultado.map((c) => c.id)).toEqual(["raridade", "idioma", "variante"]);
    expect(resultado.map((c) => c.eixo)).toEqual(["raridade", "idioma", "variante"]);
  });

  it("devolve lista vazia quando nada supera a alocada", () => {
    const alocada = copia({ raridade: "Ultra Rara", idioma: "en", variante: "primeira_edicao" });
    expect(selecionarMelhorias(alocada, [copia(), copia({ raridade: "Rara" })])).toEqual([]);
  });
});
