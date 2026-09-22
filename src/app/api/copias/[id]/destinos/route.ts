import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarDestinosElegiveisDaCopia } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/copias/:id/destinos — item 1 do incremento pós-Fase 3:
 * "estou olhando esta carta no inventário, em qual coleção ela cabe?".
 * Fluxo inverso do já existente `GET /api/vagas/:id/candidatos`, mesma
 * forma de resposta (`itens`, convenção do resto da API — ver
 * `_handoff.md`). Reaproveita `listarDestinosElegiveisDaCopia`
 * (`lib/db/consultas.ts`), que por sua vez reaproveita as regras de
 * `lib/dominio/elegibilidade-vaga.ts` — nenhuma regra nova aqui.
 *
 * Regra 5 do AGENTS.md: só lista candidatos a destino — a alocação de
 * fato acontece pelas rotas já existentes (`POST /api/vagas/:id/alocar`
 * para destino com vaga; `POST /api/colecoes/:id/copias` para
 * customizada), escolhidas pelo usuário na interface.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("copiaNaoEncontrada"), { status: 404 });
  }

  const resultado = await listarDestinosElegiveisDaCopia(db, id);
  if (!resultado.ok) {
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status: 404 });
  }

  return NextResponse.json({ itens: resultado.destinos });
}
