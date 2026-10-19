import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { mudarStatusPlano } from "@/lib/db/dex-planejamento";
import { STATUS_PLANO, type StatusPlanoDex } from "@/lib/dominio/dex-sessao";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/** PATCH /api/dex/planos/:id — `{ status }`. */
export const PATCH = comAcesso(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexPlanoNaoEncontrado"), { status: 404 });
  const corpo = (await lerCorpoJson(req)) as { status?: unknown } | undefined;
  if (!corpo || !STATUS_PLANO.includes(corpo.status as StatusPlanoDex)) return respostaCorpoInvalido();

  if (!(await mudarStatusPlano(db, id, corpo.status as StatusPlanoDex))) {
    return NextResponse.json(corpoRecusa("dexPlanoNaoEncontrado"), { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
