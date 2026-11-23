import { describe, expect, it } from "vitest";

import {
  chaveDoResultado,
  corpoDaCopia,
  desfechoDaBuscaRapida,
  escolhaContinuaValida,
  formularioInicial,
  paramsDaBusca,
  raridadeExibivel,
  paramsDaBuscaRapida,
  somarPossuidas,
  sugestaoParaCartaManual,
} from "./cadastro-busca-v2";
import type { CartaEncontradaDTO } from "./tipos-cliente";

/** Carta inventada: nada de coleção de ninguém num teste. */
function carta(extra: Partial<CartaEncontradaDTO> = {}): CartaEncontradaDTO {
  return {
    nomeEspecie: null,
    cartaId: "xyz1-004",
    idiomaCatalogo: "pt",
    localId: "004",
    nome: "Carta Inventada",
    setId: "xyz1",
    setNome: "Set Inventado",
    categoria: "Pokémon",
    raridade: "Rara",
    imagemUrl: null,
    imagemOrigem: null,
    qtdPossuida: 0,
    varianteNormalDisponivel: true,
    varianteReverseDisponivel: true,
    varianteHoloDisponivel: false,
    variantePrimeiraEdicaoDisponivel: false,
    variantePromoDisponivel: false,
    ...extra,
  };
}

describe("paramsDaBusca", () => {
  it("sem nenhum critério não há busca (a rota devolveria vazio sem dizer por quê)", () => {
    expect(paramsDaBusca({ nome: "", set: "  ", numero: "" })).toBeNull();
  });

  it("manda só o que foi digitado, aparado", () => {
    const p = paramsDaBusca({ nome: " Charizard ", set: "", numero: "4" });
    expect(p?.toString()).toBe("nome=Charizard&numero=4");
  });

  it("codifica acento e espaço", () => {
    const p = paramsDaBusca({ nome: "Pikachu ex", set: "Fusão", numero: "" });
    expect(p?.get("set")).toBe("Fusão");
    expect(p?.toString()).toContain("nome=Pikachu+ex");
  });
});

describe("paramsDaBuscaRapida", () => {
  it("separa sigla e número, com ou sem espaço", () => {
    expect(paramsDaBuscaRapida("MEW 151")?.toString()).toBe("sigla=MEW&numero=151");
    expect(paramsDaBuscaRapida("mew151")?.toString()).toBe("sigla=MEW&numero=151");
  });

  it("a sigla de um set japonês pode ter dígitos", () => {
    expect(paramsDaBuscaRapida("sv2a 002")?.toString()).toBe("sigla=SV2A&numero=002");
  });

  it("texto que não tem a forma não vira busca (nunca adivinha)", () => {
    expect(paramsDaBuscaRapida("")).toBeNull();
    expect(paramsDaBuscaRapida("charizard")).toBeNull();
    expect(paramsDaBuscaRapida("151")).toBeNull();
  });
});

describe("desfechoDaBuscaRapida", () => {
  it("uma candidata resolve direto na carta", () => {
    const a = carta();
    expect(desfechoDaBuscaRapida([a])).toEqual({ tipo: "unica", carta: a });
  });

  it("zero ou várias mostram a lista: nunca escolhe por quem cadastra", () => {
    expect(desfechoDaBuscaRapida([])).toEqual({ tipo: "lista", cartas: [] });
    const duas = [carta(), carta({ cartaId: "xyz1-005" })];
    expect(desfechoDaBuscaRapida(duas)).toEqual({ tipo: "lista", cartas: duas });
  });
});

describe("formularioInicial", () => {
  it("nasce em normal quando a carta tem normal", () => {
    expect(formularioInicial(carta()).variante).toBe("normal");
  });

  it("nunca nasce com variante que a carta não tem", () => {
    const soHolo = carta({ varianteNormalDisponivel: false, varianteReverseDisponivel: false, varianteHoloDisponivel: true });
    expect(formularioInicial(soHolo).variante).toBe("holo");
  });

  it("o idioma físico não vem da linha do catálogo (regra 7)", () => {
    expect(formularioInicial(carta({ idiomaCatalogo: "jp" })).idioma).toBe("pt");
    expect(formularioInicial(carta({ idiomaCatalogo: "en" })).idioma).toBe("pt");
  });
});

describe("corpoDaCopia", () => {
  const base = formularioInicial(carta());

  it("o idioma da cópia é o do formulário; o do catálogo vai à parte (regra 7)", () => {
    const r = corpoDaCopia(carta({ idiomaCatalogo: "en" }), { ...base, idioma: "pt", quantidade: "2" });
    expect(r).toEqual({
      ok: true,
      corpo: {
        cartaId: "xyz1-004",
        idiomaCatalogo: "en",
        idioma: "pt",
        variante: "normal",
        quantidade: 2,
        condicao: "NM",
        localizacao: undefined,
      },
    });
  });

  it("só inteiro de 1 em diante grava", () => {
    for (const q of ["", " ", "0", "-1", "1.5", "1e1", "abc", "99999999999999999999"]) {
      expect(corpoDaCopia(carta(), { ...base, quantidade: q })).toEqual({ ok: false, campo: "quantidade" });
    }
    expect(corpoDaCopia(carta(), { ...base, quantidade: " 3 " })).toMatchObject({ ok: true, corpo: { quantidade: 3 } });
  });

  it("localização em branco não vai; a escrita vai aparada", () => {
    expect(corpoDaCopia(carta(), { ...base, localizacao: "   " })).toMatchObject({
      corpo: { localizacao: undefined },
    });
    expect(corpoDaCopia(carta(), { ...base, localizacao: " Caixa 2 " })).toMatchObject({
      corpo: { localizacao: "Caixa 2" },
    });
  });
});

describe("somarPossuidas", () => {
  it("sobe o 'já tem' de toda linha da mesma carta física, e só dela", () => {
    const lista = [
      carta({ qtdPossuida: 1 }),
      carta({ idiomaCatalogo: "en", qtdPossuida: 1 }),
      carta({ cartaId: "xyz1-005", qtdPossuida: 0 }),
    ];
    const nova = somarPossuidas(lista, "xyz1-004", 2);
    expect(nova.map((c) => c.qtdPossuida)).toEqual([3, 3, 0]);
    expect(lista[0].qtdPossuida).toBe(1);
  });
});

describe("escolhaContinuaValida", () => {
  const a = carta();
  it("a carta escolhida precisa continuar na lista, na mesma linha do catálogo", () => {
    expect(escolhaContinuaValida([a], { cartaId: a.cartaId, idiomaCatalogo: "pt" })).toBe(true);
    expect(escolhaContinuaValida([a], { cartaId: a.cartaId, idiomaCatalogo: "en" })).toBe(false);
    expect(escolhaContinuaValida([], { cartaId: a.cartaId, idiomaCatalogo: "pt" })).toBe(false);
    expect(escolhaContinuaValida(null, { cartaId: a.cartaId, idiomaCatalogo: "pt" })).toBe(false);
    expect(escolhaContinuaValida([a], null)).toBe(false);
  });

  it("a chave da linha separa as duas linhas do catálogo da mesma carta", () => {
    expect(chaveDoResultado({ cartaId: "a-1", idiomaCatalogo: "pt" })).not.toBe(
      chaveDoResultado({ cartaId: "a-1", idiomaCatalogo: "en" }),
    );
  });
});

describe("sugestaoParaCartaManual", () => {
  const filtros = { nome: " Ivy ", set: " abc ", numero: " 9 " };

  it("depois de uma busca rápida, vale a sigla e o número dela", () => {
    expect(sugestaoParaCartaManual(filtros, "SMH 011", "rapida")).toEqual({ sigla: "SMH", numero: "011", nome: "" });
  });

  it("depois da busca por campos, a rápida que sobrou de antes não entra", () => {
    expect(sugestaoParaCartaManual(filtros, "SMH 011", "busca")).toEqual({ sigla: "abc", numero: "9", nome: "Ivy" });
  });

  it("uma rápida que não tem a forma cai nos campos", () => {
    expect(sugestaoParaCartaManual(filtros, "ivy", "rapida")).toEqual({ sigla: "abc", numero: "9", nome: "Ivy" });
  });
});

describe("raridadeExibivel", () => {
  it("None e Sem raridade são ausência de raridade, não uma raridade", () => {
    expect(raridadeExibivel("None")).toBeNull();
    expect(raridadeExibivel("sem raridade")).toBeNull();
    expect(raridadeExibivel(null)).toBeNull();
    expect(raridadeExibivel("  ")).toBeNull();
  });

  it("o resto passa como está", () => {
    expect(raridadeExibivel("Rara Dupla")).toBe("Rara Dupla");
  });
});
