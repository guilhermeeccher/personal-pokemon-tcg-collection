import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { alocarCopiaNaVaga, desalocarVaga } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * POST /api/vagas/:id/alocar — aloca uma cópia à vaga (spec §5 Fase 2).
 * Body: `{ copiaId: string, permitirForaDePadrao?: boolean }`.
 *
 * Erros de regra de negócio (elegibilidade — regras 2, 3, 7 —, vaga já
 * preenchida, cópia já alocada em outra vaga, idioma fora de padrão sem
 * o sinalizador) voltam 400 com a RECUSA em `recusa` — chave estável e
 * valores, que a tela traduz para o idioma da interface
 * (`lib/dominio/recusa.ts`) — nunca 500, nunca sucesso silencioso. 404 só
 * quando a própria vaga da URL não existe — inclusive quando `:id` nem
 * tem formato de UUID (achado do coordenador, 2026-08-25: sintaxe
 * inválida nunca vira 500 do Postgres).
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

  const resultado = await alocarCopiaNaVaga(db, id, copiaId, { permitirForaDePadrao });
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "vagaNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }

  return NextResponse.json({
    ok: true,
    copiaAlocadaId: resultado.copiaAlocadaId,
    dividida: resultado.dividida,
    foraDePadrao: resultado.foraDePadrao,
  });
}

/**
 * DELETE /api/vagas/:id/alocar — desaloca a vaga. A cópia volta ao
 * inventário livre e NUNCA é apagada. Não funde lotes divididos
 * anteriormente por uma alocação prévia — fragmentação conhecida e
 * deliberada (ver relatório da tarefa).
 *
 * Comportamento depende do tipo da coleção da vaga (ver
 * `desalocarVaga` em `lib/db/consultas.ts`): pokedex/set mantêm a vaga,
 * só zerando `copia_id` (é ela que alimenta o "o que falta"); coleção
 * CUSTOMIZADA não tem vaga vazia por decisão fechada — aqui a própria
 * vaga é apagada, sem tocar na cópia. O chamador não precisa saber o
 * tipo: a rota é a mesma para os três.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("vagaNaoEncontrada"), { status: 404 });
  }
  const resultado = await desalocarVaga(db, id);
  if (!resultado.ok) {
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
