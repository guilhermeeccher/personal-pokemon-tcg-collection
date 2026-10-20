import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { reordenarEtapas } from "@/lib/db/dex-planejamento";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../../../guarda";

/**
 * PUT /api/dex/tarefas/:id/etapas/ordem — `{ ids }`: a lista inteira das
 * etapas da tarefa, na ordem nova, gravada numa transação. Lista que não é
 * exatamente o conjunto atual (a tela estava velha) é recusada com 409.
 */
export const PUT = comAcesso(async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexTarefaNaoEncontrada"), { status: 404 });
  const corpo = (await lerCorpoJson(req)) as { ids?: unknown } | undefined;
  if (!corpo || typeof corpo !== "object" || !Array.isArray(corpo.ids)) return respostaCorpoInvalido();

  const r = await reordenarEtapas(db, id, corpo.ids);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});
