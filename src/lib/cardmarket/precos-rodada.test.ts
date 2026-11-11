import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A rodada inteira, sem banco: as funções de gravação são trocadas por
 * espiões, e a ficha da TCGdex é falsa. O que se confere aqui é o resumo que
 * a rodada devolve contra o que ela grava — o comando agendável decide o
 * desfecho pelo resumo, e um "ok" numa rodada que o banco guarda com erro
 * esconderia a falha de quem agendou.
 */
vi.mock("@/lib/db/precos-cardmarket", () => ({
  consultasCardmarketDesde: vi.fn(),
  gravarPrecoCardmarket: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/precos-liga", () => ({
  concluirRodadaDePreco: vi.fn(async () => {}),
  criarRodadaDePrecoSeLivre: vi.fn(),
  encerrarRodadasDePrecoMortas: vi.fn(),
  listarCartasEspeciaisPossuidas: vi.fn(),
  registrarFotoDaRodada: vi.fn(async () => {}),
  rodadaDePrecoViva: vi.fn(),
  tocarProgressoDePreco: vi.fn(async () => {}),
}));

import type { Database } from "@/lib/db/client";
import { concluirRodadaDePreco } from "@/lib/db/precos-liga";
import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";

import { executarRodadaCardmarket } from "./precos";

const db = {} as Database;
const cotacao = { cotacao: 6, data: "2026-01-02" };
const comPreco = { cardmarket: { unit: "EUR", idProduct: 1, trend: 2, avg: 2, low: 1 } };
const cartas = [
  { cartaId: "x-1", idiomas: ["en" as const] },
  { cartaId: "x-2", idiomas: ["en" as const] },
];

beforeEach(() => vi.clearAllMocks());

describe("executarRodadaCardmarket — o erro devolvido é o gravado", () => {
  it("carta que falha sozinha: a rodada segue, e o resumo traz o mesmo erro que foi gravado", async () => {
    const obterCarta = vi.fn(async (_idioma: string, cartaId: string) => {
      if (cartaId === "x-1") throw new Error("HTTP 503");
      return { pricing: comPreco };
    });
    const resumo = await executarRodadaCardmarket(db, "r", cartas, cotacao, { obterCarta });

    const gravado = vi.mocked(concluirRodadaDePreco).mock.calls[0][2].erro;
    expect(resumo.cartasConsultadas).toBe(1);
    expect(resumo.cartasComFalha).toBe(1);
    expect(gravado).toMatch(/1 carta\(s\) falharam/);
    expect(resumo.erro).toBe(gravado);
  });

  it("bloqueio aborta, e o resumo traz o erro do bloqueio", async () => {
    const obterCarta = vi.fn(async () => {
      throw new ErroBloqueioUpstream("HTTP 403");
    });
    const resumo = await executarRodadaCardmarket(db, "r", cartas, cotacao, { obterCarta });

    expect(obterCarta).toHaveBeenCalledTimes(1);
    expect(resumo.erro).toMatch(/bloqueado/);
    expect(resumo.erro).toBe(vi.mocked(concluirRodadaDePreco).mock.calls[0][2].erro);
  });

  it("sem falha nenhuma, não há erro nem no resumo nem no gravado", async () => {
    const obterCarta = vi.fn(async () => ({ pricing: comPreco }));
    const resumo = await executarRodadaCardmarket(db, "r", cartas, cotacao, { obterCarta });

    expect(resumo.erro).toBeUndefined();
    expect(vi.mocked(concluirRodadaDePreco).mock.calls[0][2].erro).toBeUndefined();
  });
});
