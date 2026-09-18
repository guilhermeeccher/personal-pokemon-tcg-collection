import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarCandidatosDaVaga } from "@/lib/db/consultas";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/vagas/:id/candidatos — cópias do inventário elegíveis para
 * preencher a vaga: livres (sem vaga em nenhuma coleção), dentro do
 * universo da vaga (regras 2, 3 e 7 do AGENTS.md). Cópias fora do
 * `idiomaExigido` da coleção vêm marcadas `foraDePadrao`, nunca omitidas
 * (spec §5 Fase 2, item 4). Regra 5: isto é sugestão — nada aqui aloca
 * sozinho, a escolha é sempre do usuário.
 *
 * Resposta sob a chave `itens`, mesma convenção de `/api/colecoes` e
 * `/api/copias` (que é o formato de dado desta lista — cópias).
 *
 * `:id` fora do formato UUID nunca existe — 404 direto, sem deixar o
 * Postgres rejeitar a sintaxe e virar 500 (achado do coordenador,
 * 2026-08-25).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Vaga não encontrada." }, { status: 404 });
  }
  const resultado = await listarCandidatosDaVaga(db, id);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.motivo }, { status: 404 });
  }
  return NextResponse.json({ itens: resultado.candidatos });
}
