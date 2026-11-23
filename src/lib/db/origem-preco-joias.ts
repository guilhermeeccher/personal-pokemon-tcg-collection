/**
 * De onde veio o preço de uma joia no Cardmarket: o euro, a cotação (PTAX de
 * fechamento, venda) e o dia dela, que a visão geral mostra ao lado do valor
 * em reais (regra "Cardmarket rotulado com fonte, cotação e data"). O valor em
 * reais em si já vem de `listarJoias`; isto só traz o que o explica. Só lê, só
 * as cartas pedidas, e só na fonte Cardmarket — a Liga não tem conversão.
 */

import { inArray } from "drizzle-orm";

import type { OrigemPrecoCardmarket } from "@/lib/dominio/visao-geral-v2";

import type { Database } from "./client";
import { precoCartaCardmarket } from "./schema";

function numero(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function lerOrigemPrecoCardmarket(
  db: Database,
  cartaIds: readonly string[],
): Promise<Map<string, OrigemPrecoCardmarket>> {
  if (cartaIds.length === 0) return new Map();
  const linhas = await db
    .select({
      cartaId: precoCartaCardmarket.cartaId,
      valorEur: precoCartaCardmarket.valorEur,
      cotacao: precoCartaCardmarket.cotacao,
      cotacaoData: precoCartaCardmarket.cotacaoData,
      criterioValor: precoCartaCardmarket.criterioValor,
    })
    .from(precoCartaCardmarket)
    .where(inArray(precoCartaCardmarket.cartaId, [...cartaIds]));
  return new Map(
    linhas.map((l) => [
      l.cartaId,
      {
        criterioValor: l.criterioValor,
        valorEur: numero(l.valorEur),
        cotacao: numero(l.cotacao),
        cotacaoData: l.cotacaoData,
      },
    ]),
  );
}
