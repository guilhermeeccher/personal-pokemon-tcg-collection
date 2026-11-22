import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { moverColecaoParaGrupo } from "@/lib/db/grupos-colecao";
import { lerGrupoId } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { canonizarUuid, ehUuid } from "@/lib/dominio/uuid";

/**
 * PATCH /api/colecoes/:id/grupo — `{ grupoId }` (`null` = "sem grupo"): move a
 * coleção para o fim do grupo e renumera a seção que ela deixou. Para o
 * grupo em que ela já está, nada muda (200).
 */
export const PATCH = comAcesso(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Canonizado: o id é comparado em memória com os que vêm do banco.
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const grupo = lerGrupoId((corpo as Record<string, unknown> | null)?.grupoId, false);
  if (!grupo.ok) {
    return NextResponse.json({ erro: "erro" in grupo ? grupo.erro : "grupoId inválido." }, { status: 400 });
  }
  const r = await moverColecaoParaGrupo(db, id, grupo.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});
