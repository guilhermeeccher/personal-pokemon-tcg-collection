import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { mudarStatusTarefa } from "@/lib/db/dex-planejamento";
import { STATUS_TAREFA, type StatusTarefaDex } from "@/lib/dominio/dex-sessao";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/**
 * PATCH /api/dex/tarefas/:id — `{ status }`. Concluir uma tarefa não
 * registra Pokémon: a tela oferece o cadastro, e quem confirma é o usuário.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexTarefaNaoEncontrada"), { status: 404 });
  const corpo = (await lerCorpoJson(req)) as { status?: unknown } | undefined;
  if (!corpo || !STATUS_TAREFA.includes(corpo.status as StatusTarefaDex)) return respostaCorpoInvalido();

  if (!(await mudarStatusTarefa(db, id, corpo.status as StatusTarefaDex))) {
    return NextResponse.json(corpoRecusa("dexTarefaNaoEncontrada"), { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
