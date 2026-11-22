/**
 * Sugestões de coleção (decisão de 2026-11-22). Camada fina sobre o Drizzle:
 * contar, cobrir, dispensar e ordenar são de `lib/dominio/sugestoes-colecao.ts`;
 * aqui só se lê o que a montagem precisa e se grava a dispensa.
 *
 * Nada aqui chama serviço externo: tudo sai do catálogo local e do inventário.
 */

import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "./client";
import { obterNomesEspeciePorNumero, raridadeEnDaCarta } from "./consultas";
import { cartaCatalogo, colecao, copia, sugestaoDispensada } from "./schema";
import {
  especiesCandidatas,
  montarSugestoes,
  setsCandidatos,
  universosDosSets,
  type CartaPossuida,
  type Sugestao,
  type TipoSugestao,
} from "@/lib/dominio/sugestoes-colecao";

/**
 * As cartas que o usuário tem, uma linha por (carta, linha de catálogo), só
 * linhas ocidentais. Toda cópia conta, alocada ou livre; a quantidade de
 * cópias não importa — quem conta cartas distintas é o domínio.
 */
async function lerCartasPossuidas(db: Database): Promise<CartaPossuida[]> {
  return db
    .selectDistinct({
      cartaId: copia.cartaId,
      idioma: cartaCatalogo.idioma,
      setId: cartaCatalogo.setId,
      localId: cartaCatalogo.localId,
      dexIds: cartaCatalogo.dexIds,
      tipos: cartaCatalogo.tipos,
      ilustrador: cartaCatalogo.ilustrador,
      raridade: cartaCatalogo.raridade,
      raridadeEn: raridadeEnDaCarta(copia.cartaId),
      forma: cartaCatalogo.forma,
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
    )
    .where(inArray(copia.idiomaCatalogo, ["pt", "en"]));
}

/** As linhas pt e en dos sets candidatos — o universo de cada um, carta a carta. */
async function lerLinhasDosSets(db: Database, setIds: readonly string[]) {
  if (setIds.length === 0) return [];
  const linhas = await db
    .select({
      cartaId: cartaCatalogo.id,
      ativa: cartaCatalogo.ativa,
      setId: cartaCatalogo.setId,
      idioma: cartaCatalogo.idioma,
      localId: cartaCatalogo.localId,
      qtdOficial: cartaCatalogo.setQtdOficial,
      qtdTotal: cartaCatalogo.setQtdTotal,
      setNome: cartaCatalogo.setNome,
      setSigla: cartaCatalogo.setSigla,
      setLancamento: cartaCatalogo.setLancamento,
    })
    .from(cartaCatalogo)
    .where(and(inArray(cartaCatalogo.setId, [...setIds]), inArray(cartaCatalogo.idioma, ["pt", "en"])));
  return linhas.map((l) => ({ ...l, idioma: l.idioma as "pt" | "en" }));
}

/** `GET /api/sugestoes`: todas as sugestões, já na ordem. Só lê. */
export async function listarSugestoes(db: Database): Promise<Sugestao[]> {
  const [cartas, colecoes, dispensadas] = await Promise.all([
    lerCartasPossuidas(db),
    db.select({ id: colecao.id, nome: colecao.nome, tipo: colecao.tipo, parametro: colecao.parametro }).from(colecao),
    db.select({ tipo: sugestaoDispensada.tipo, valor: sugestaoDispensada.valor }).from(sugestaoDispensada),
  ]);
  const [linhasDosSets, nomesEspecie] = await Promise.all([
    lerLinhasDosSets(db, setsCandidatos(cartas)),
    obterNomesEspeciePorNumero(db, especiesCandidatas(cartas)),
  ]);
  return montarSugestoes({
    cartas,
    sets: universosDosSets(linhasDosSets),
    colecoes,
    dispensadas,
    nomesEspecie,
  });
}

/** "Não tenho interesse": grava a dispensa, para sempre. Dispensar de novo não faz nada. */
export async function dispensarSugestao(db: Database, tipo: TipoSugestao, valor: string): Promise<void> {
  await db.insert(sugestaoDispensada).values({ tipo, valor }).onConflictDoNothing();
}
