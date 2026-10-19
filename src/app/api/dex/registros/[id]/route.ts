import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { removerRegistro } from "@/lib/db/dex";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { respostaSeModuloDesligado } from "../../guarda";

/** DELETE /api/dex/registros/:id — apaga um registro (lançamento errado). */
export const DELETE = comAcesso(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id) || !(await removerRegistro(db, id))) {
    return NextResponse.json(corpoRecusa("dexRegistroNaoEncontrado"), { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
