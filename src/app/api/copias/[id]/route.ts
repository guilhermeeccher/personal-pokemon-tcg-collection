import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { atualizarCopia, obterCopiaPorId, obterVariantesDisponiveisDaCarta, removerCopia } from "@/lib/db/consultas";
import { validarEdicaoCopia } from "@/lib/dominio/copia";
import { validarVariantesContraCatalogo } from "@/lib/dominio/variantes-catalogo";

/** PATCH /api/copias/:id — edita campos de uma cópia (spec §5 Fase 1). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarEdicaoCopia(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Edição inválida.", detalhes: resultado.erros }, { status: 400 });
  }

  // Trocar a variante na edição está sujeito à mesma restrição do
  // cadastro (a variante não pode ser mudada para algo que a carta não
  // tem). Identidade da carta não muda na edição — só busca a existente
  // para checar contra o catálogo.
  if (resultado.patch.variante !== undefined) {
    const existente = await obterCopiaPorId(db, id);
    if (!existente) {
      return NextResponse.json({ erro: "Cópia não encontrada." }, { status: 404 });
    }
    const disponiveis = await obterVariantesDisponiveisDaCarta(
      db,
      existente.cartaId,
      existente.idiomaCatalogo,
    );
    const errosVariante = validarVariantesContraCatalogo(
      [{ cartaId: existente.cartaId, variante: resultado.patch.variante }],
      disponiveis ? { [existente.cartaId]: disponiveis } : {},
    );
    if (errosVariante.length > 0) {
      return NextResponse.json(
        { erro: "Variante fora do catálogo para esta carta.", detalhes: errosVariante },
        { status: 400 },
      );
    }
  }

  const atualizou = await atualizarCopia(db, id, resultado.patch);
  if (!atualizou) {
    return NextResponse.json({ erro: "Cópia não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/copias/:id — remove uma cópia. Se ela estava alocada, a FK
 * `vaga.copia_id` (ON DELETE SET NULL) libera a vaga automaticamente —
 * confirmado em `src/lib/db/schema.ts` e no relatório da tarefa.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removeu = await removerCopia(db, id);
  if (!removeu) {
    return NextResponse.json({ erro: "Cópia não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
