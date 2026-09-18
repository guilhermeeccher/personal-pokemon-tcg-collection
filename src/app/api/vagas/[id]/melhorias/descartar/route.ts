import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { descartarMelhoria, restaurarMelhoria } from "@/lib/db/consultas";
import { ehUuid } from "@/lib/dominio/uuid";

/** Lê `copiaId` do corpo — mesmo formato nos dois métodos. */
async function lerCopiaId(req: Request): Promise<string | null> {
  try {
    const corpo = (await req.json()) as { copiaId?: unknown };
    return typeof corpo.copiaId === "string" && corpo.copiaId.trim() !== ""
      ? corpo.copiaId
      : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/vagas/:id/melhorias/descartar — cala a sugestão desta cópia
 * NESTA vaga (spec §5, Fase 9). Body: `{ copiaId: string }`.
 *
 * O escopo do silêncio é o par, não a vaga (decisão dele, 2026-09-05):
 * se amanhã entrar no inventário outra cópia melhor, a vaga volta a
 * sinalizar. Nada é apagado — o descarte é ausência de aviso, não
 * remoção de dado. Idempotente.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 404 });
  }

  const copiaId = await lerCopiaId(req);
  if (!copiaId) {
    return NextResponse.json({ erro: "copiaId ausente ou vazio." }, { status: 400 });
  }
  if (!ehUuid(copiaId)) {
    return NextResponse.json({ erro: "Cópia não encontrada." }, { status: 404 });
  }

  const resultado = await descartarMelhoria(db, id, copiaId);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.motivo }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/vagas/:id/melhorias/descartar — desfaz o descarte, para o
 * "descartei sem querer" logo depois do clique. Idempotente: desfazer o
 * que não foi descartado não é erro.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 404 });
  }

  const copiaId = await lerCopiaId(req);
  if (!copiaId) {
    return NextResponse.json({ erro: "copiaId ausente ou vazio." }, { status: 400 });
  }
  if (!ehUuid(copiaId)) {
    return NextResponse.json({ erro: "Cópia não encontrada." }, { status: 404 });
  }

  await restaurarMelhoria(db, id, copiaId);
  return NextResponse.json({ ok: true });
}
