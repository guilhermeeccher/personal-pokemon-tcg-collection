import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { definirCaixasReservadas } from "@/lib/db/dex";
import { ehCaixasReservadas, MAX_CAIXAS_RESERVADAS } from "@/lib/dominio/dex-caixas";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../guarda";

/**
 * PATCH /api/dex/preferencias — `{ caixasReservadas }`: quantas caixas do
 * HOME vêm antes da Kanto 1 (D9). Desloca só o número das caixas; não toca
 * registro nenhum.
 */
export async function PATCH(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const corpo = (await lerCorpoJson(req)) as { caixasReservadas?: unknown } | undefined;
  if (!corpo) return respostaCorpoInvalido();
  if (!ehCaixasReservadas(corpo.caixasReservadas)) {
    return NextResponse.json(
      { erro: `caixasReservadas inválido (inteiro de 0 a ${MAX_CAIXAS_RESERVADAS}).` },
      { status: 400 },
    );
  }
  await definirCaixasReservadas(db, corpo.caixasReservadas);
  return NextResponse.json({ ok: true });
}
