import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { criarFaltantesDoGrupo, obterFaltantesDoGrupo } from "@/lib/db/grupos-colecao";
import { lerPedidoFaltantes } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { canonizarUuid, ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/grupos-colecao/:id/faltantes — a prévia de "Criar coleções que
 * faltam" de um grupo ligado a uma série (`FaltantesDoGrupoDTO`): cada set
 * ocidental da série em ordem de lançamento, com as coleções que já o têm na
 * receita, o nome sugerido e se vem marcado. Só lê.
 */
export const GET = comAcesso(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Canonizado: o id é comparado em memória com os que vêm do banco.
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  const r = await obterFaltantesDoGrupo(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ serieId: r.serieId, serieRotulo: r.serieRotulo, sets: r.sets });
});

/**
 * POST /api/grupos-colecao/:id/faltantes — `{ serieId, sets: [{ setId, nome }] }`
 * (`CriarFaltantesDTO`, 1 a 50 sets): cria todas as coleções numa transação só,
 * ou nenhuma, no fim do grupo e em ordem de lançamento, pelo mesmo caminho de
 * `POST /api/colecoes`. A série do grupo que não é mais `serieId` (outra aba a
 * trocou ou desligou) recusa com 409.
 * 201 `{ criadas: [{ id, nome }] }`.
 */
export const POST = comAcesso(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const leitura = lerPedidoFaltantes(corpo);
  if (!leitura.ok) {
    return "recusa" in leitura
      ? NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 })
      : NextResponse.json({ erro: leitura.erro }, { status: 400 });
  }
  try {
    const r = await criarFaltantesDoGrupo(db, id, leitura.valor);
    if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
    return NextResponse.json({ criadas: r.criadas }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/grupos-colecao/:id/faltantes] falha ao criar:", err);
    return NextResponse.json(corpoRecusa("falhaAoGravarColecao"), { status: 400 });
  }
});
