import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adicionarJogoPossuido, listarJogosPossuidos } from "@/lib/db/dex";
import { corpoDaRecusa } from "@/lib/dominio/recusa";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../guarda";

/** GET /api/dex/jogos — os jogos que o usuário tem. */
export async function GET() {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  return NextResponse.json({ itens: await listarJogosPossuidos(db) });
}

/** POST /api/dex/jogos — `{ jogoId, desde?, notas? }`: marca um jogo do catálogo como possuído. */
export async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const corpo = (await lerCorpoJson(req)) as { jogoId?: unknown; desde?: unknown; notas?: unknown } | undefined;
  if (!corpo || typeof corpo.jogoId !== "string") return respostaCorpoInvalido();
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

  const r = await adicionarJogoPossuido(db, {
    jogoId: corpo.jogoId,
    desde: texto(corpo.desde),
    notas: texto(corpo.notas),
  });
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: 409 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
