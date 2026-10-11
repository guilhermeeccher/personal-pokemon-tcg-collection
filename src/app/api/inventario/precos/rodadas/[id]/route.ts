import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { excluirRodadaDePreco } from "@/lib/db/precos-liga";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * Exclui uma rodada de preços encerrada e o ponto dela no gráfico — a lista
 * "Pesquisas anteriores" da tela `/inventario/precos`. Os preços que a rodada
 * trouxe ficam; o porquê está em `excluirRodadaDePreco`.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("rodadaDePrecoNaoEncontrada"), { status: 404 });
  }

  const resultado = await excluirRodadaDePreco(db, id);
  if (resultado === "naoEncontrada") {
    return NextResponse.json(corpoRecusa("rodadaDePrecoNaoEncontrada"), { status: 404 });
  }
  if (resultado === "emAndamento") {
    return NextResponse.json(corpoRecusa("rodadaDePrecoEmAndamento"), { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
