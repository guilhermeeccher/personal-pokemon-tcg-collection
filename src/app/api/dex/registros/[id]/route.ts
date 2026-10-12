import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { corrigirRegistro, removerRegistro } from "@/lib/db/dex";
import { lerDadosRegistro } from "@/lib/dominio/dex-registro";
import { corpoDasRecusas, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

import { lerCorpoJson, respostaSeModuloDesligado } from "../../guarda";

/**
 * PATCH /api/dex/registros/:id — corrige forma, shiny, origem, data e notas.
 * O `local` do corpo é ignorado: mover é `POST .../mover`, com as regras de
 * ida e volta.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("dexRegistroNaoEncontrado"), { status: 404 });

  const corpo = await lerCorpoJson(req);
  // `local` é exigido pelo leitor comum; aqui ele não é usado.
  const dados = lerDadosRegistro(
    typeof corpo === "object" && corpo !== null ? { local: "-", ...corpo } : corpo,
  );
  if (typeof dados === "string") return NextResponse.json({ erro: dados }, { status: 400 });

  const { local: _ignorado, ...correcao } = dados;
  void _ignorado;
  const r = await corrigirRegistro(db, id, correcao);
  if (!r.ok) return NextResponse.json(corpoDasRecusas(r.recusas), { status: r.status });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/dex/registros/:id — apaga um registro (lançamento errado). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;
  const { id } = await params;
  if (!ehUuid(id) || !(await removerRegistro(db, id))) {
    return NextResponse.json(corpoRecusa("dexRegistroNaoEncontrado"), { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
