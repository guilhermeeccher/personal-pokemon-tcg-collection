import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { desmarcarTrofeu } from "@/lib/db/dex-planejamento";
import { corpoRecusa } from "@/lib/dominio/recusa";

import { respostaSeModuloDesligado } from "../../guarda";

/** DELETE /api/dex/trofeus/:id — desfaz a conquista. */
export const DELETE = comAcesso(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!(await desmarcarTrofeu(db, id))) return NextResponse.json(corpoRecusa("dexTrofeuNaoEncontrado"), { status: 404 });
  return NextResponse.json({ ok: true });
});
