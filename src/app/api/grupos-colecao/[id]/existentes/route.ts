import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterExistentesParaGrupo, trazerExistentesParaGrupo } from "@/lib/db/grupos-colecao";
import { lerPedidoExistentes } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { canonizarUuid, ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/grupos-colecao/:id/existentes — a prévia de "Trazer as que já
 * existem" (`ExistentesDoGrupoDTO`): as coleções de set com algum set da
 * série na receita que não estão neste grupo, na ordem da lista, e a série em
 * que a prévia se baseou (volta no POST). Só lê.
 */
export const GET = comAcesso(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Canonizado: o id é comparado em memória com os que vêm do banco.
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  const r = await obterExistentesParaGrupo(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ serieId: r.serieId, colecoes: r.colecoes });
});

/**
 * POST /api/grupos-colecao/:id/existentes — `{ serieId, itens: [{ id,
 * grupoOrigemId }] }` (`TrazerExistentesDTO`): traz essas coleções para o fim
 * do grupo, na ordem da lista, numa transação. Recusa tudo com 409, e nada é
 * gravado, quando a série do grupo não é mais `serieId`, quando uma coleção
 * não está mais em `grupoOrigemId` (outra aba a moveu) ou saiu da prévia.
 */
export const POST = comAcesso(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const leitura = lerPedidoExistentes(corpo);
  if (!leitura.ok) {
    return "recusa" in leitura
      ? NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 })
      : NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }
  const r = await trazerExistentesParaGrupo(db, id, leitura.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ movidas: r.movidas });
});
