import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { criarPlanoManual, mapaTrofeusAtivos } from "@/lib/db/dex-planejamento";
import { lerDadosPlano } from "@/lib/dominio/dex-sessao";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../guarda";

/** POST /api/dex/planos — `{ titulo, objetivo?, inicio, fim?, trofeuIds? }`: plano criado pela tela. */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const corpo = await lerCorpoJson(req);
  if (!corpo || typeof corpo !== "object") return respostaCorpoInvalido();

  const dados = lerDadosPlano(corpo as Record<string, unknown>, await mapaTrofeusAtivos(db));
  if (Array.isArray(dados)) return NextResponse.json({ erro: dados.join("; ") }, { status: 400 });
  return NextResponse.json({ ok: true, id: await criarPlanoManual(db, dados) }, { status: 201 });
});
