import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { carregarContextoRegistro } from "@/lib/db/dex";
import { adicionarTarefaManual, mapaTrofeusAtivos } from "@/lib/db/dex-planejamento";
import { lerDadosTarefa } from "@/lib/dominio/dex-sessao";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../../guarda";

/** POST /api/dex/planos/:id/tarefas — `{ titulo, tipo, descricao?, jogoId?, formaIds?, trofeuId? }`: a tarefa entra no fim. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexPlanoNaoEncontrado"), { status: 404 });
  const corpo = await lerCorpoJson(req);
  if (!corpo || typeof corpo !== "object") return respostaCorpoInvalido();

  const [trofeus, ctx] = await Promise.all([mapaTrofeusAtivos(db), carregarContextoRegistro(db)]);
  const dados = lerDadosTarefa(corpo as Record<string, unknown>, trofeus, ctx.formasAtivas);
  if (Array.isArray(dados)) return NextResponse.json({ erro: dados.join("; ") }, { status: 400 });
  const tarefaId = await adicionarTarefaManual(db, id, dados);
  if (!tarefaId) return NextResponse.json(corpoRecusa("dexPlanoNaoEncontrado"), { status: 404 });
  return NextResponse.json({ ok: true, id: tarefaId }, { status: 201 });
}
