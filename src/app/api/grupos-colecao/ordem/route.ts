import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { reordenarGruposColecao } from "@/lib/db/grupos-colecao";
import { corpoDaRecusa } from "@/lib/dominio/recusa";

/**
 * PUT /api/grupos-colecao/ordem — `{ ids }`: todos os grupos, na ordem nova.
 * Tem de ser exatamente o conjunto atual; uma lista velha de outra aba é
 * recusada com 409, nunca aplicada pela metade. Renumera 0..n-1.
 */
export const PUT = comAcesso(async function PUT(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const ids = (typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>).ids : undefined);
  const r = await reordenarGruposColecao(db, ids);
  if (r.ok) return NextResponse.json({ ok: true });
  if ("formato" in r) {
    return NextResponse.json({ erro: "ids inválido (lista de ids, sem repetição)." }, { status: 400 });
  }
  return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
});
