/**
 * Consultas da Living Dex. Nenhuma toca tabela de cartas.
 */
import { asc, eq, sql } from "drizzle-orm";

import type { CategoriaFormaDex, SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import { resolverSecoes, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";

import type { db as dbPadrao } from "./client";
import { dexForma, dexSecao } from "./schema";

type Db = typeof dbPadrao;

/** Vagas ativas, na ordem das caixas do HOME. */
export async function listarFormasDex(db: Db): Promise<FormaDexDTO[]> {
  return db
    .select({
      id: dexForma.id,
      numero: dexForma.numero,
      especie: dexForma.especie,
      forma: dexForma.forma,
      categoria: dexForma.categoria,
      geracao: dexForma.geracao,
      lendario: dexForma.lendario,
      mitico: dexForma.mitico,
      shinyObtenivel: dexForma.shinyObtenivel,
      sprite: dexForma.sprite,
    })
    .from(dexForma)
    .where(eq(dexForma.ativa, true))
    .orderBy(asc(dexForma.ordem));
}

export async function lerSecoesDex(db: Db): Promise<SecoesContadas> {
  const linhas: { categoria: CategoriaFormaDex; conta: boolean }[] = await db
    .select({ categoria: dexSecao.categoria, conta: dexSecao.conta })
    .from(dexSecao);
  return resolverSecoes(linhas);
}

export async function definirSecaoDex(db: Db, categoria: SecaoLigavel, conta: boolean): Promise<void> {
  await db
    .insert(dexSecao)
    .values({ categoria, conta })
    .onConflictDoUpdate({
      target: dexSecao.categoria,
      set: { conta, atualizadoEm: sql`now()` },
    });
}
