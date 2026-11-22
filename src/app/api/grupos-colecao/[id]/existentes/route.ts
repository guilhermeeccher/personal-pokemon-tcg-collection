import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterExistentesParaGrupo, trazerExistentesParaGrupo } from "@/lib/db/grupos-colecao";
import { lerIds } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/grupos-colecao/:id/existentes — a prévia de "Trazer as que já
 * existem" (`ExistentesDoGrupoDTO`): as coleções de set com algum set da
 * série na receita que não estão neste grupo, na ordem da lista. Só lê.
 */
export const GET = comAcesso(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  const r = await obterExistentesParaGrupo(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ colecoes: r.colecoes });
});

/**
 * POST /api/grupos-colecao/:id/existentes — `{ ids }`: traz essas coleções
 * para o fim do grupo, na ordem da lista, numa transação. Um id fora da
 * prévia recusa tudo (409), e nada é gravado.
 */
export const POST = comAcesso(async function POST(
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
  const leitura = lerIds(corpo);
  if (!leitura.ok) {
    return "recusa" in leitura
      ? NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 })
      : NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }
  const r = await trazerExistentesParaGrupo(db, id, leitura.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ movidas: r.movidas });
});
