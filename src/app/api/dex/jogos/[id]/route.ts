import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { atualizarJogoPossuido, removerJogoPossuido } from "@/lib/db/dex";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/** PATCH /api/dex/jogos/:id — `{ desde?, notas?, ativo? }`. */
export const PATCH = comAcesso(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexJogoNaoEncontrado"), { status: 404 });

  const corpo = (await lerCorpoJson(req)) as Record<string, unknown> | undefined;
  if (!corpo || typeof corpo !== "object") return respostaCorpoInvalido();

  const dados: { desde?: string | null; notas?: string | null; ativo?: boolean } = {};
  for (const campo of ["desde", "notas"] as const) {
    if (!(campo in corpo)) continue;
    const v = corpo[campo];
    if (v !== null && typeof v !== "string") return respostaCorpoInvalido();
    dados[campo] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }
  if ("ativo" in corpo) {
    if (typeof corpo.ativo !== "boolean") return respostaCorpoInvalido();
    dados.ativo = corpo.ativo;
  }

  if (!(await atualizarJogoPossuido(db, id, dados))) {
    return NextResponse.json(corpoRecusa("dexJogoNaoEncontrado"), { status: 404 });
  }
  return NextResponse.json({ ok: true });
});

/** DELETE /api/dex/jogos/:id — recusa se houver registro no jogo (desativar é o caminho). */
export const DELETE = comAcesso(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexJogoNaoEncontrado"), { status: 404 });

  const r = await removerJogoPossuido(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
});
