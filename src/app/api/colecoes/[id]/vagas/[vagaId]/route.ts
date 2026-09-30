import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { excluirVagaDaColecao } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * DELETE /api/colecoes/:id/vagas/:vagaId — tira uma carta de uma coleção de
 * set. Vaga preenchida sai junto com a alocação, e a cópia volta a ficar
 * livre no inventário — nunca é apagada. A confirmação é da tela. Ver
 * `excluirVagaDaColecao`.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; vagaId: string }> },
) {
  const { id, vagaId } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  if (!ehUuid(vagaId)) {
    return NextResponse.json(corpoRecusa("vagaNaoEncontrada"), { status: 404 });
  }

  const resultado = await excluirVagaDaColecao(db, id, vagaId);
  if (!resultado.ok) {
    const chave = resultado.motivo.chave;
    const status = chave === "colecaoNaoEncontrada" || chave === "vagaNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }
  return NextResponse.json({ ok: true, copiaLiberada: resultado.copiaLiberada });
}
