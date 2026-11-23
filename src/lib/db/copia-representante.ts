/**
 * A cópia que abre o detalhe de uma carta nas telas que listam **cartas**
 * (repetidas, joias da visão geral). A regra de escolha é pura
 * (`lib/dominio/copia-representante.ts`); aqui só a leitura: as cópias dos
 * `carta_id` pedidos, com a vaga que cada uma ocupa.
 *
 * Uma leitura só, com `inArray`, limitada aos ids da página: nunca varre o
 * inventário. Quem pede já tem a lista curta (uma página de repetidas, 8 joias).
 */

import { eq, inArray } from "drizzle-orm";

import { escolherRepresentantes } from "@/lib/dominio/copia-representante";

import type { Database } from "./client";
import { copia, vaga } from "./schema";

export async function copiasRepresentantes(db: Database, cartaIds: readonly string[]): Promise<Map<string, string>> {
  if (cartaIds.length === 0) return new Map();
  const linhas = await db
    .select({ id: copia.id, cartaId: copia.cartaId, criadoEm: copia.criadoEm, vagaId: vaga.id })
    .from(copia)
    .leftJoin(vaga, eq(vaga.copiaId, copia.id))
    .where(inArray(copia.cartaId, [...cartaIds]));
  return escolherRepresentantes(
    linhas.map((l) => ({
      id: l.id,
      cartaId: l.cartaId,
      alocada: l.vagaId !== null,
      criadoEmMs: l.criadoEm.getTime(),
    })),
  );
}
