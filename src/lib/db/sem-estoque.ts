/**
 * O registro de cartas sem estoque na Liga — `sem_estoque_liga`.
 *
 * O porquê está em `lib/dominio/sem-estoque-liga.ts`. Aqui só se lê e escreve.
 */

import { desc, eq, gt, sql } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import { semEstoqueLiga } from "./schema";
import {
  chaveSemEstoque,
  corteSemEstoque,
  type CartaSemEstoque,
} from "@/lib/dominio/sem-estoque-liga";

export interface SemEstoqueSalvo {
  id: string;
  chave: string;
  nome: string;
  numero: string;
  total: string | null;
  qualidade: string;
  registradoEm: Date;
}

/** Os registros ainda dentro da validade, do mais recente para o mais antigo. */
export async function listarSemEstoqueVigente(
  db: Database,
  agora: Date = new Date(),
): Promise<SemEstoqueSalvo[]> {
  return db
    .select()
    .from(semEstoqueLiga)
    .where(gt(semEstoqueLiga.registradoEm, corteSemEstoque(agora)))
    .orderBy(desc(semEstoqueLiga.registradoEm), semEstoqueLiga.nome);
}

/**
 * Grava as cartas. A que já existe tem o prazo renovado: colar de novo é a
 * Liga dizendo, hoje, que continua sem estoque.
 */
export async function registrarSemEstoque(
  db: Database | Transacao,
  cartas: readonly CartaSemEstoque[],
): Promise<number> {
  if (cartas.length === 0) return 0;
  const gravadas = await db
    .insert(semEstoqueLiga)
    .values(
      cartas.map((c) => ({
        chave: chaveSemEstoque(c),
        nome: c.nome,
        numero: c.numero,
        total: c.total,
        qualidade: c.qualidade,
      })),
    )
    .onConflictDoUpdate({
      target: [semEstoqueLiga.chave, semEstoqueLiga.qualidade],
      set: {
        nome: sql`excluded.nome`,
        numero: sql`excluded.numero`,
        total: sql`excluded.total`,
        registradoEm: sql`now()`,
      },
    })
    .returning({ id: semEstoqueLiga.id });
  return gravadas.length;
}

/** "Voltar a oferecer": o usuário desfaz o registro antes de ele vencer. */
export async function removerSemEstoque(db: Database, id: string): Promise<number> {
  const removidas = await db
    .delete(semEstoqueLiga)
    .where(eq(semEstoqueLiga.id, id))
    .returning({ id: semEstoqueLiga.id });
  return removidas.length;
}
