import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { criarGrupoColecao } from "@/lib/db/grupos-colecao";
import { lerCriacaoGrupo } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa } from "@/lib/dominio/recusa";

/**
 * POST /api/grupos-colecao — cria um grupo no fim da lista de grupos.
 * `{ nome, serieId? }`: nome aparado, 1 a 80 caracteres; `serieId`, quando
 * vem, tem de ser uma série do catálogo ocidental (sensível a caixa).
 * A lista de grupos sai em `GET /api/colecoes`.
 */
export const POST = comAcesso(async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const leitura = lerCriacaoGrupo(corpo);
  if (!leitura.ok) {
    return "recusa" in leitura
      ? NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 })
      : NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }
  const r = await criarGrupoColecao(db, leitura.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ id: r.id }, { status: 201 });
});
