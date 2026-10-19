import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { marcarTrofeu } from "@/lib/db/dex-planejamento";
import { corpoDaRecusa } from "@/lib/dominio/recusa";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../guarda";

/** POST /api/dex/trofeus — `{ trofeuId, obtidoEm, notas? }`: marca um troféu como conquistado. */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const corpo = (await lerCorpoJson(req)) as { trofeuId?: unknown; obtidoEm?: unknown; notas?: unknown } | undefined;
  if (!corpo || typeof corpo.trofeuId !== "string" || typeof corpo.obtidoEm !== "string") return respostaCorpoInvalido();
  const notas = typeof corpo.notas === "string" && corpo.notas.trim() !== "" ? corpo.notas.trim() : null;

  const r = await marcarTrofeu(db, { trofeuId: corpo.trofeuId, obtidoEm: corpo.obtidoEm, notas });
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true }, { status: 201 });
});
