import { describe, expect, it } from "vitest";

import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";
import { ErroItemUpstream, type Idioma } from "@/lib/sync/tcgdex";

import {
  consultarCartaCardmarket,
  JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS,
  segundosDeRodadaCardmarket,
  type ObterFicha,
} from "./precos";

/**
 * Nenhuma requisição sai daqui: a ficha é falsa, por idioma. `null` responde
 * como 404; um erro é lançado como veio.
 */
function fichas(porIdioma: Partial<Record<Idioma, unknown>>) {
  const pedidos: Idioma[] = [];
  const obter: ObterFicha = async (idioma) => {
    pedidos.push(idioma);
    const resposta = porIdioma[idioma];
    if (resposta === undefined || resposta === null) throw new ErroItemUpstream(`HTTP 404 (${idioma})`);
    if (resposta instanceof Error) throw resposta;
    return { pricing: resposta };
  };
  return { obter, pedidos };
}

const comPreco = (trend: number) => ({ cardmarket: { unit: "EUR", idProduct: 7, trend, avg: trend + 1, low: 1 } });

describe("consultarCartaCardmarket", () => {
  it("pergunta primeiro em inglês e para na primeira ficha que existe", async () => {
    const { obter, pedidos } = fichas({ en: comPreco(10), pt: comPreco(99) });
    const r = await consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["pt", "en"] }, obter);
    expect(pedidos).toEqual(["en"]);
    expect(r).toMatchObject({ idiomaConsulta: "en", preco: { tendenciaEur: 10, idProduto: 7 } });
  });

  it("404 num idioma passa ao seguinte", async () => {
    const { obter, pedidos } = fichas({ en: null, pt: comPreco(4) });
    const r = await consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["pt", "en"] }, obter);
    expect(pedidos).toEqual(["en", "pt"]);
    expect(r).toMatchObject({ idiomaConsulta: "pt", preco: { tendenciaEur: 4 } });
  });

  it("404 em todos é não encontrada, sem idioma", async () => {
    const { obter, pedidos } = fichas({});
    const r = await consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["jp", "en", "pt"] }, obter);
    expect(pedidos).toEqual(["en", "pt", "jp"]);
    expect(r).toEqual({ idiomaConsulta: null, preco: null });
  });

  it("ficha que existe sem preço do Cardmarket é resposta: não encontrada, sem tentar outro idioma", async () => {
    const { obter, pedidos } = fichas({ en: { cardmarket: null }, pt: comPreco(4) });
    const r = await consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["pt", "en"] }, obter);
    expect(pedidos).toEqual(["en"]);
    expect(r).toEqual({ idiomaConsulta: "en", preco: null });
  });

  it("bloqueio e falha transitória sobem, sem tentar outro idioma", async () => {
    const bloqueio = fichas({ en: new ErroBloqueioUpstream("HTTP 429"), pt: comPreco(4) });
    await expect(
      consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["pt", "en"] }, bloqueio.obter),
    ).rejects.toBeInstanceOf(ErroBloqueioUpstream);
    expect(bloqueio.pedidos).toEqual(["en"]);

    const transitoria = fichas({ en: new Error("HTTP 503"), pt: comPreco(4) });
    await expect(
      consultarCartaCardmarket({ cartaId: "x-1", idiomas: ["pt", "en"] }, transitoria.obter),
    ).rejects.toThrow("HTTP 503");
    expect(transitoria.pedidos).toEqual(["en"]);
  });

  it("carta sem idioma nenhum é falha, não 'não encontrada'", async () => {
    const { obter, pedidos } = fichas({});
    await expect(consultarCartaCardmarket({ cartaId: "x-1", idiomas: [] }, obter)).rejects.toThrow();
    expect(pedidos).toEqual([]);
  });
});

describe("tempo da rodada", () => {
  it("a janela de rodada morta cobre o pior caso de uma carta (3 idiomas × 3 tentativas × 20 s)", () => {
    expect(JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS).toBeGreaterThanOrEqual(3 * 3 * 20);
    // E continua em minutos, não em horas: a rodada inteira dura minutos.
    expect(JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS).toBeLessThan(15 * 60);
  });

  it("estima meio segundo por carta", () => {
    expect(segundosDeRodadaCardmarket(0)).toBe(0);
    expect(segundosDeRodadaCardmarket(1)).toBe(1);
    expect(segundosDeRodadaCardmarket(120)).toBe(60);
  });
});
