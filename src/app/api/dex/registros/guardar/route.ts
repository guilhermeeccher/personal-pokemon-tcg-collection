import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { guardarRegistros } from "@/lib/db/dex";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/** Teto de um "Guardei tudo": uma rodada cheia, com folga. */
const MAX_IDS = 2000;

/**
 * POST /api/dex/registros/guardar — `{ ids }`. "Guardei" de Recebidos (D9):
 * o usuário levou esses Pokémon para a caixa deles no HOME. Só mexe no que
 * está no HOME e ainda a guardar; o resto é ignorado, sem erro.
 */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const corpo = (await lerCorpoJson(req)) as { ids?: unknown } | undefined;
  if (!corpo) return respostaCorpoInvalido();
  const { ids } = corpo;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_IDS ||
    !ids.every((id) => typeof id === "string" && ehUuid(id))
  ) {
    return NextResponse.json({ erro: "ids ausente ou inválido." }, { status: 400 });
  }

  const guardados = await guardarRegistros(db, ids as string[]);
  return NextResponse.json({ ok: true, guardados });
});
