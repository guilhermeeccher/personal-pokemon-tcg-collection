import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { alternarSecretasDaColecao } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * PATCH /api/colecoes/:id/secretas — liga/desliga `incluirSecretas` numa
 * coleção de set. Única edição permitida ao parâmetro estrutural: só
 * acrescenta ou remove vagas no fim da numeração (regra 4). Ao desligar,
 * recusa se alguma vaga secreta estiver preenchida — nunca apaga
 * alocação do usuário.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Id fora do formato UUID nunca existe — 404 direto, sem deixar o
  // Postgres rejeitar a sintaxe e virar 500 (achado do coordenador,
  // 2026-08-25).
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const incluirSecretas = (corpo as { incluirSecretas?: unknown })?.incluirSecretas;
  if (typeof incluirSecretas !== "boolean") {
    return NextResponse.json(
      { erro: `incluirSecretas inválido: ${String(incluirSecretas)} (esperado boolean)` },
      { status: 400 },
    );
  }

  const resultado = await alternarSecretasDaColecao(db, id, incluirSecretas);
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "colecaoNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }
  return NextResponse.json({ ok: true });
}
