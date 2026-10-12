import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { moverRegistro } from "@/lib/db/dex";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../../../guarda";

/**
 * POST /api/dex/registros/:id/mover — `{ local, confirmarSemVolta? }`.
 *
 * Sair de um jogo só de envio (GO, FireRed) volta 409 com a recusa
 * `dexConfirmarSemVolta` até a tela reenviar com `confirmarSemVolta: true`
 * — a confirmação de que o Pokémon não volta é do usuário, nunca da rota.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexRegistroNaoEncontrado"), { status: 404 });

  const corpo = (await lerCorpoJson(req)) as { local?: unknown; confirmarSemVolta?: unknown } | undefined;
  if (!corpo || typeof corpo.local !== "string" || corpo.local === "") return respostaCorpoInvalido();

  const r = await moverRegistro(db, id, corpo.local, corpo.confirmarSemVolta === true);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ ok: true });
}
