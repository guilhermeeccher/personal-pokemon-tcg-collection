import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarMelhoriasDaColecao } from "@/lib/db/consultas";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/melhorias — vagas PREENCHIDAS que têm no
 * inventário uma cópia livre melhor (spec §5, Fase 9). Cada item traz a
 * cópia alocada hoje e as candidatas ordenadas da melhor para a pior,
 * com o eixo que fez cada uma ganhar (raridade, idioma ou variante).
 *
 * Rota separada de `GET /api/colecoes/:id` de propósito: a tela da
 * coleção precisa aparecer com a grade completa mesmo que o cálculo das
 * melhorias demore, e recarregar a grade inteira a cada troca só para
 * atualizar um distintivo seria desperdício. Coleção `customizada`
 * devolve lista vazia — lá não existe universo, então "melhor" não quer
 * dizer nada.
 *
 * Regra 5 do AGENTS.md: isto sugere e ordena — a troca é sempre um
 * clique dele, em `POST /api/vagas/:id/trocar`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  const resultado = await listarMelhoriasDaColecao(db, id);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.motivo }, { status: 404 });
  }
  return NextResponse.json({ itens: resultado.itens });
}
