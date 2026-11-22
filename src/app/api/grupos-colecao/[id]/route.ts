import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { editarGrupoColecao, excluirGrupoColecao } from "@/lib/db/grupos-colecao";
import { lerEdicaoGrupo } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * PATCH /api/grupos-colecao/:id — `{ nome?, serieId? }`: renomeia e/ou liga
 * (texto) ou desliga (`null`) a série. Nada mais muda.
 */
export const PATCH = comAcesso(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const leitura = lerEdicaoGrupo(corpo);
  if (!leitura.ok) {
    return "recusa" in leitura
      ? NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 })
      : NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }
  const r = await editarGrupoColecao(db, id, leitura.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});

/**
 * DELETE /api/grupos-colecao/:id — exclui o grupo e **nunca** uma coleção:
 * as dele vão para o fim de "sem grupo", na ordem que tinham, na mesma
 * transação.
 */
export const DELETE = comAcesso(async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  const r = await excluirGrupoColecao(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});
