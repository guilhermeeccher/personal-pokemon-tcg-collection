import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { trocarCopiaDaVaga } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * POST /api/vagas/:id/trocar — substitui a cópia de uma vaga preenchida
 * por outra do inventário (spec §5, Fase 9). Body:
 * `{ copiaId: string, permitirForaDePadrao?: boolean }`.
 *
 * Não é açúcar sobre desalocar + alocar: as duas metades rodam na MESMA
 * transação (`trocarCopiaDaVaga`), porque entre elas a vaga fica vazia —
 * uma falha no meio deixaria a coleção pior do que estava, por conta do
 * próprio sistema. Ou a troca inteira acontece, ou nada muda.
 *
 * Erros de regra (vaga vazia, coleção customizada, elegibilidade, cópia
 * já alocada em outra vaga) voltam 400 com a RECUSA em `recusa` — chave
 * estável e valores, que a tela traduz (`lib/dominio/recusa.ts`); 404 só quando
 * a vaga da URL não existe — inclusive quando `:id` nem tem formato de
 * UUID.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("vagaNaoEncontrada"), { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const body = corpo as { copiaId?: unknown; permitirForaDePadrao?: unknown };
  const copiaId =
    typeof body.copiaId === "string" && body.copiaId.trim() !== "" ? body.copiaId : null;
  if (!copiaId) {
    return NextResponse.json({ erro: "copiaId ausente ou vazio." }, { status: 400 });
  }
  const permitirForaDePadrao = body.permitirForaDePadrao === true;

  const resultado = await trocarCopiaDaVaga(db, id, copiaId, { permitirForaDePadrao });
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "vagaNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }

  return NextResponse.json({
    ok: true,
    copiaAlocadaId: resultado.copiaAlocadaId,
    copiaLiberadaId: resultado.copiaLiberadaId,
    dividida: resultado.dividida,
    foraDePadrao: resultado.foraDePadrao,
  });
}
