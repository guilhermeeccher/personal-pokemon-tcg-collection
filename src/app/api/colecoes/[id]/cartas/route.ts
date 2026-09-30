import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { incluirCartaNaColecao } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * POST /api/colecoes/:id/cartas — inclui uma carta avulsa numa coleção de
 * set, como vaga vazia. Corpo: `{ setId, localId }` — a carta, não uma
 * cópia: a coleção passa a esperar essa carta, e ela entra no que falta.
 * Ver `incluirCartaNaColecao`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const { setId, localId } = (corpo ?? {}) as { setId?: unknown; localId?: unknown };
  if (typeof setId !== "string" || setId.trim() === "" || typeof localId !== "string" || localId.trim() === "") {
    return NextResponse.json(
      { erro: "setId e localId são obrigatórios (texto não vazio)." },
      { status: 400 },
    );
  }

  const resultado = await incluirCartaNaColecao(db, id, setId, localId);
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "colecaoNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }
  return NextResponse.json({ vagaId: resultado.vagaId }, { status: 201 });
}
