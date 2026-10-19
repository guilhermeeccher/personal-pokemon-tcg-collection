import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { corrigirRegistros, criarRegistrosEmLote } from "@/lib/db/dex";
import { lerDadosRegistro, lerLoteCadastro } from "@/lib/dominio/dex-registro";
import { corpoDasRecusas } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaCorpoInvalido, respostaSeModuloDesligado } from "../guarda";

/**
 * POST /api/dex/registros — cadastro por jogo: `{ jogoId, itens: [{ formaId,
 * normal, shiny }] }`. Um registro por Pokémon, todos nascidos no jogo e
 * ainda nele. Recusas vêm todas juntas, e com qualquer uma nada é gravado.
 */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const lote = lerLoteCadastro(await lerCorpoJson(req));
  if (typeof lote === "string") return NextResponse.json({ erro: lote }, { status: 400 });

  const r = await criarRegistrosEmLote(db, lote);
  if (!r.ok) return NextResponse.json(corpoDasRecusas(r.recusas), { status: 400 });
  return NextResponse.json({ ok: true, criados: r.criados }, { status: 201 });
});

/**
 * PATCH /api/dex/registros — corrige um grupo do inventário: `{ ids,
 * formaId, shiny, jogoOrigem, capturadoEm, notas }`. O local não muda por
 * aqui: mover é `POST /api/dex/registros/mover`, com as regras de ida e volta.
 */
export const PATCH = comAcesso(async function PATCH(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const corpo = await lerCorpoJson(req);
  if (typeof corpo !== "object" || corpo === null) return respostaCorpoInvalido();
  const { ids, ...resto } = corpo as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && ehUuid(id))) {
    return NextResponse.json({ erro: "ids ausente ou inválido." }, { status: 400 });
  }
  // O leitor comum exige `local`; aqui ele não é usado.
  const dados = lerDadosRegistro({ ...resto, local: "-" });
  if (typeof dados === "string") return NextResponse.json({ erro: dados }, { status: 400 });

  const { formaId, shiny, jogoOrigem, capturadoEm, notas } = dados;
  const r = await corrigirRegistros(db, ids as string[], { formaId, shiny, jogoOrigem, capturadoEm, notas });
  if (!r.ok) return NextResponse.json(corpoDasRecusas(r.recusas), { status: r.status });
  return NextResponse.json({ ok: true });
});
