import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { excluirColecao, obterColecaoComVagas, atualizarColecao } from "@/lib/db/consultas";
import { validarEdicaoColecao } from "@/lib/dominio/colecao";
import { ehUuid } from "@/lib/dominio/uuid";

/** GET /api/colecoes/:id — lê uma coleção com suas vagas. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Id fora do formato UUID nunca existe no banco — devolve 404 direto,
  // sem deixar o Postgres rejeitar a sintaxe e virar 500 (achado do
  // coordenador, 2026-08-25: "não existe" não é "erro do servidor").
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  const colecao = await obterColecaoComVagas(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  return NextResponse.json(colecao);
}

/**
 * PATCH /api/colecoes/:id — edita nome, notas e/ou idiomaExigido. Nunca
 * toca no parâmetro estrutural (escopo/set/secretas) — mudar o universo
 * de uma coleção com vagas já preenchidas invalidaria o progresso.
 * Exceção: ligar/desligar `incluirSecretas` tem rota própria,
 * `PATCH /api/colecoes/:id/secretas`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarEdicaoColecao(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Edição inválida.", detalhes: resultado.erros }, { status: 400 });
  }

  const atualizou = await atualizarColecao(db, id, resultado.patch);
  if (!atualizou) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/colecoes/:id — exclui a coleção. As vagas caem por
 * cascade; as cópias do inventário NUNCA são tocadas (spec: excluir
 * coleção não apaga cópia).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  const excluiu = await excluirColecao(db, id);
  if (!excluiu) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
