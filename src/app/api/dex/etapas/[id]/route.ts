import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { editarEtapa, excluirEtapa } from "@/lib/db/dex-planejamento";
import { lerEdicaoEtapa } from "@/lib/dominio/dex-etapas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/**
 * PATCH /api/dex/etapas/:id — `{ texto?, detalhe?, feita? }`. Marcar a
 * última etapa não conclui a tarefa: a tela avisa, e quem conclui é o
 * usuário (`lib/dominio/dex-etapas.ts`).
 */
export const PATCH = comAcesso(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexEtapaNaoEncontrada"), { status: 404 });
  const corpo = await lerCorpoJson(req);
  if (corpo === undefined) return respostaCorpoInvalido();

  const edicao = lerEdicaoEtapa(corpo);
  if (Array.isArray(edicao)) return NextResponse.json({ erro: edicao.join("; ") }, { status: 400 });
  const r = await editarEtapa(db, id, edicao);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});

/** DELETE /api/dex/etapas/:id — a ordem das que ficam é renumerada. */
export const DELETE = comAcesso(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexEtapaNaoEncontrada"), { status: 404 });

  const r = await excluirEtapa(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});
