import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { moverRegistros } from "@/lib/db/dex";
import { corpoDaRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../guarda";

/** Teto de um envio em lote: "enviar todas" de um jogo cheio, com folga. */
const MAX_IDS = 2000;

/**
 * POST /api/dex/registros/mover — `{ ids, local, confirmarSemVolta? }`. Move
 * um registro ou um lote ("enviar todas deste jogo"), numa transação.
 *
 * Sair de um jogo só de envio (GO, FireRed) volta 409 com a recusa
 * `dexConfirmarSemVolta` até a tela reenviar com `confirmarSemVolta: true`
 * — a confirmação de que o Pokémon não volta é do usuário, nunca da rota.
 */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const corpo = (await lerCorpoJson(req)) as { ids?: unknown; local?: unknown; confirmarSemVolta?: unknown } | undefined;
  if (!corpo || typeof corpo.local !== "string" || corpo.local === "") return respostaCorpoInvalido();
  const { ids } = corpo;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_IDS ||
    !ids.every((id) => typeof id === "string" && ehUuid(id))
  ) {
    return NextResponse.json({ erro: "ids ausente ou inválido." }, { status: 400 });
  }

  const r = await moverRegistros(db, ids as string[], corpo.local, corpo.confirmarSemVolta === true);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true, movidos: r.movidos });
});
