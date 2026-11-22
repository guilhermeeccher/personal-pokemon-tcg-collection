import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { reordenarColecoes } from "@/lib/db/grupos-colecao";
import { lerGrupoId } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa } from "@/lib/dominio/recusa";

/**
 * PUT /api/colecoes/ordem — `{ grupoId, ids }`: as coleções de uma seção
 * (`grupoId` nulo = "sem grupo") na ordem nova. Tem de ser exatamente as
 * coleções dela hoje; uma lista velha de outra aba é recusada com 409, nunca
 * aplicada pela metade. Renumera 0..n-1.
 */
export const PUT = comAcesso(async function PUT(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const obj = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const grupo = lerGrupoId(obj.grupoId, false);
  if (!grupo.ok) {
    return NextResponse.json({ erro: "erro" in grupo ? grupo.erro : "grupoId inválido." }, { status: 400 });
  }
  const r = await reordenarColecoes(db, grupo.valor, obj.ids);
  if (r.ok) return NextResponse.json({ ok: true });
  if ("formato" in r) {
    return NextResponse.json({ erro: "ids inválido (lista de ids, sem repetição)." }, { status: 400 });
  }
  return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
});
