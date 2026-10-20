import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { adicionarEtapa } from "@/lib/db/dex-planejamento";
import { lerDadosEtapa } from "@/lib/dominio/dex-etapas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../../guarda";

/**
 * POST /api/dex/tarefas/:id/etapas — `{ texto, detalhe? }`: a etapa entra no
 * fim. Só em tarefa aberta de plano ativo, e até 50 por tarefa
 * (`lib/dominio/dex-etapas.ts`).
 */
export const POST = comAcesso(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexTarefaNaoEncontrada"), { status: 404 });
  const corpo = await lerCorpoJson(req);
  if (corpo === undefined) return respostaCorpoInvalido();

  const dados = lerDadosEtapa(corpo);
  if (Array.isArray(dados)) return NextResponse.json({ erro: dados.join("; ") }, { status: 400 });
  const r = await adicionarEtapa(db, id, dados);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
});
