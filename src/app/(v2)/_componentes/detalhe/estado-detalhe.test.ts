import { describe, expect, it } from "vitest";

import type { CopiaDoDetalheV2DTO, DetalheCartaV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import {
  chaveDaRecusa,
  copiaNaVagaAgora,
  melhoriaComDescartadas,
  estadoDaVaga,
  opcoesDeVariante,
  ordenarCopias,
  seguimentoDaRecusa,
  urlDoDetalhe,
  vagaMudouDesdeAGrade,
  vagaSomeAoDesalocar,
  valoresDoEixo,
} from "./estado-detalhe";

/* Dados inventados no formato real; nada de coleção de verdade. */
const COLECAO = { id: "c0000000-0000-4000-8000-000000000001", nome: "Teste", tipo: "set" as const, idiomaExigido: null };

const VAGA_VAZIA_SET: VagaGradeV2DTO = {
  id: "v0000000-0000-4000-8000-000000000001",
  chave: "tst/001",
  numero: "001",
  cartaNome: "Carta Inventada",
  carta: { cartaId: "tst-001", idiomaCatalogo: "pt", raridade: "Comum" },
  livres: 2,
};
const VAGA_VAZIA_DEX: VagaGradeV2DTO = { id: "v0000000-0000-4000-8000-000000000002", chave: "25", numero: "25", especie: "Pikachu" };
const VAGA_PREENCHIDA: VagaGradeV2DTO = {
  ...VAGA_VAZIA_SET,
  livres: undefined,
  copia: { id: "k0000000-0000-4000-8000-000000000001", variante: "normal", idioma: "pt", condicao: "NM", desde: "2026-11-01T00:00:00.000Z" },
  upgrade: "variante",
};

function copia(p: Partial<CopiaDoDetalheV2DTO> & { id: string }): CopiaDoDetalheV2DTO {
  return {
    idiomaCatalogo: "pt",
    idioma: "pt",
    variante: "normal",
    quantidade: 1,
    condicao: "NM",
    gradedEmpresa: null,
    gradedNota: null,
    gradedCertificado: null,
    localizacao: null,
    aquisicaoData: null,
    aquisicaoOrigem: null,
    aquisicaoPreco: null,
    notas: null,
    criadoEm: "2026-11-01T00:00:00.000Z",
    alocacao: null,
    ...p,
  };
}

describe("urlDoDetalhe", () => {
  it("vaga com carta pede a ficha da vaga e diz de que vaga veio", () => {
    expect(urlDoDetalhe({ modo: "vaga", colecao: COLECAO, vaga: VAGA_VAZIA_SET }, null)).toBe(
      `/api/cartas/tst-001/detalhe?idioma=pt&vaga=${VAGA_VAZIA_SET.id}`,
    );
  });

  it("vaga vazia de Pokédex não tem carta para ler (regra 3)", () => {
    expect(urlDoDetalhe({ modo: "vaga", colecao: { ...COLECAO, tipo: "pokedex" }, vaga: VAGA_VAZIA_DEX }, null)).toBeNull();
  });

  it("cópia pede a ficha da cópia em foco, que pode ser outra da mesma carta", () => {
    const abertura = { modo: "copia" as const, cartaId: "swsh4.5-SV001", copiaId: "a" };
    expect(urlDoDetalhe(abertura, null)).toBe("/api/cartas/swsh4.5-SV001/detalhe?copia=a");
    expect(urlDoDetalhe(abertura, "b")).toBe("/api/cartas/swsh4.5-SV001/detalhe?copia=b");
  });
});

describe("estadoDaVaga", () => {
  it("preenchida leva a cópia e o eixo do upgrade, que é só sinal (regra 8)", () => {
    expect(estadoDaVaga(VAGA_PREENCHIDA)).toEqual({ tipo: "preenchida", copiaId: VAGA_PREENCHIDA.copia!.id, upgrade: "variante" });
  });

  it("vazia de set espera a carta; vazia de Pokédex, a espécie", () => {
    expect(estadoDaVaga(VAGA_VAZIA_SET)).toEqual({ tipo: "vazia", alvo: "carta", livres: 2 });
    expect(estadoDaVaga(VAGA_VAZIA_DEX)).toEqual({ tipo: "vazia", alvo: "especie", livres: 0 });
  });
});

describe("vagaMudouDesdeAGrade", () => {
  const detalhe = (copiaId: string | null, id = VAGA_PREENCHIDA.id) =>
    ({ contexto: { vaga: { id, chave: "tst/001", numero: "001", copiaId, colecaoId: COLECAO.id, colecaoNome: "", colecaoTipo: "set" }, copiaId: null } }) as unknown as DetalheCartaV2DTO;

  it("a mesma cópia: nada mudou", () => {
    expect(vagaMudouDesdeAGrade(VAGA_PREENCHIDA, detalhe(VAGA_PREENCHIDA.copia!.id))).toBe(false);
  });
  it("outra cópia, ou a vaga esvaziada por outra aba: mudou", () => {
    expect(vagaMudouDesdeAGrade(VAGA_PREENCHIDA, detalhe("outra"))).toBe(true);
    expect(vagaMudouDesdeAGrade(VAGA_PREENCHIDA, detalhe(null))).toBe(true);
    expect(vagaMudouDesdeAGrade(VAGA_VAZIA_SET, detalhe("nova", VAGA_VAZIA_SET.id))).toBe(true);
  });
  it("sem contexto de vaga não há o que comparar", () => {
    expect(vagaMudouDesdeAGrade(VAGA_PREENCHIDA, null)).toBe(false);
  });
});

describe("vagaSomeAoDesalocar", () => {
  it("só a customizada apaga a vaga ao desalocar", () => {
    expect(vagaSomeAoDesalocar("customizada")).toBe(true);
    expect(vagaSomeAoDesalocar("set")).toBe(false);
    expect(vagaSomeAoDesalocar("pokedex")).toBe(false);
  });
});

describe("seguimentoDaRecusa", () => {
  it("validação mantém a tela; sumiu ou mudou relê", () => {
    expect(seguimentoDaRecusa(400, "edicaoInvalida")).toBe("manter");
    expect(seguimentoDaRecusa(400, null)).toBe("manter");
    expect(seguimentoDaRecusa(404, null)).toBe("reler");
    expect(seguimentoDaRecusa(409, null)).toBe("reler");
  });
  it("a candidata tomada por outra aba (400) também relê", () => {
    expect(seguimentoDaRecusa(400, "copiaJaAlocada")).toBe("reler");
    expect(seguimentoDaRecusa(400, "vagaJaPreenchida")).toBe("reler");
  });
  it("lê a chave do corpo de recusa", () => {
    expect(chaveDaRecusa({ recusa: { chave: "copiaJaAlocada" } })).toBe("copiaJaAlocada");
    expect(chaveDaRecusa({ erro: "texto" })).toBeNull();
    expect(chaveDaRecusa(null)).toBeNull();
  });
});

describe("ordenarCopias", () => {
  const alocada = (id: string, colecaoNome: string, numero: string) =>
    copia({ id, alocacao: { vagaId: `v-${id}`, chave: numero, numero, colecaoId: "c", colecaoNome, colecaoTipo: "set", desde: "2026-11-01T00:00:00.000Z" } });

  it("foco primeiro, depois alocadas por coleção e número, depois livres pela data", () => {
    const lista = [
      copia({ id: "livre-nova", criadoEm: "2026-11-03T00:00:00.000Z" }),
      alocada("b10", "B", "10"),
      copia({ id: "livre-velha", criadoEm: "2026-11-01T00:00:00.000Z" }),
      alocada("b9", "B", "9"),
      alocada("a1", "A", "1"),
      copia({ id: "foco", criadoEm: "2026-11-09T00:00:00.000Z" }),
    ];
    expect(ordenarCopias(lista, "foco").map((c) => c.id)).toEqual(["foco", "a1", "b9", "b10", "livre-velha", "livre-nova"]);
  });
});

describe("opcoesDeVariante", () => {
  const carta = {
    varianteNormalDisponivel: true,
    varianteReverseDisponivel: true,
    varianteHoloDisponivel: false,
    variantePrimeiraEdicaoDisponivel: false,
    variantePromoDisponivel: false,
  } as DetalheCartaV2DTO["carta"];

  it("as do catálogo", () => {
    expect(opcoesDeVariante(carta, "normal")).toEqual(["normal", "reverse"]);
  });
  it("e a guardada, mesmo fora do catálogo, para a seleção não mentir", () => {
    expect(opcoesDeVariante(carta, "holo")).toEqual(["holo", "normal", "reverse"]);
  });
});

describe("valoresDoEixo", () => {
  const atual = { raridade: "Comum", idioma: "pt" as const, variante: "normal" as const };
  const candidata = { raridade: "Rara Dupla", idioma: "en" as const, variante: "reverse" as const };
  it("cada eixo lê o seu par", () => {
    expect(valoresDoEixo("raridade", atual, candidata)).toEqual({ de: "Comum", para: "Rara Dupla" });
    expect(valoresDoEixo("idioma", atual, candidata)).toEqual({ de: "pt", para: "en" });
    expect(valoresDoEixo("variante", atual, candidata)).toEqual({ de: "normal", para: "reverse" });
  });
});

describe("copiaNaVagaAgora", () => {
  it("a leitura do detalhe vence a escrita e a grade", () => {
    expect(copiaNaVagaAgora(VAGA_PREENCHIDA, { copiaId: "escrita" }, { copiaId: "lida" })).toBe("lida");
    expect(copiaNaVagaAgora(VAGA_PREENCHIDA, null, { copiaId: null })).toBeNull();
  });
  it("sem leitura (falhou ou não chegou), vale a última escrita: alocada não vira vazia", () => {
    expect(copiaNaVagaAgora(VAGA_VAZIA_SET, { copiaId: "alocada" }, null)).toBe("alocada");
    expect(copiaNaVagaAgora(VAGA_PREENCHIDA, { copiaId: null }, null)).toBeNull();
  });
  it("sem leitura nem escrita, a grade", () => {
    expect(copiaNaVagaAgora(VAGA_PREENCHIDA, null, null)).toBe(VAGA_PREENCHIDA.copia!.id);
    expect(copiaNaVagaAgora(VAGA_VAZIA_SET, null, null)).toBeNull();
  });
});

describe("melhoriaComDescartadas", () => {
  const atual = {
    copiaId: "na-vaga",
    cartaNome: "Carta Inventada",
    cartaLocalId: "001",
    setNome: "Set Inventado",
    raridade: "Comum",
    idioma: "pt" as const,
    variante: "normal" as const,
    condicao: "NM" as const,
    imagemUrl: null,
    imagemOrigem: null,
  };
  const candidata = (id: string) => ({
    id,
    cartaId: "tst-001",
    idiomaCatalogo: "pt" as const,
    cartaNome: "Carta Inventada",
    cartaLocalId: "001",
    setId: "tst",
    setNome: "Set Inventado",
    raridade: "Comum",
    idioma: "en" as const,
    variante: "normal" as const,
    condicao: "NM" as const,
    quantidade: 1,
    imagemUrl: null,
    imagemOrigem: null,
    eixo: "idioma" as const,
  });
  const vaga = { id: "v", chave: "tst/001" };

  it("a descartada que a releitura não traz continua na lista, ao fim", () => {
    const lida = { vagaId: "v", chave: "tst/001", atual, candidatas: [candidata("a")] };
    const r = melhoriaComDescartadas(lida, [{ atual, candidata: candidata("b") }], vaga, "na-vaga");
    expect(r?.candidatas.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("sem leitura nenhuma, as descartadas sozinhas mantêm a seção", () => {
    const r = melhoriaComDescartadas(null, [{ atual, candidata: candidata("b") }], vaga, "na-vaga");
    expect(r?.atual.copiaId).toBe("na-vaga");
    expect(r?.candidatas.map((c) => c.id)).toEqual(["b"]);
  });
  it("não repete a que a leitura ainda traz, e ignora descarte contra outra cópia", () => {
    const lida = { vagaId: "v", chave: "tst/001", atual, candidatas: [candidata("a")] };
    expect(melhoriaComDescartadas(lida, [{ atual, candidata: candidata("a") }], vaga, "na-vaga")?.candidatas).toHaveLength(1);
    expect(melhoriaComDescartadas(null, [{ atual, candidata: candidata("b") }], vaga, "outra")).toBeNull();
  });
});
