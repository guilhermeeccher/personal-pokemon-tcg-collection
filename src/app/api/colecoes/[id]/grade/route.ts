import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerGradeDaColecao } from "@/lib/db/grade-colecao";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/grade — a grade da coleção numa chamada só, para a
 * v2: cada vaga com a cópia alocada (ficha, variante, idioma físico,
 * condição, desde quando), a carta esperada da vaga vazia de set, o sinal de
 * upgrade, quantas cópias livres servem e as escolhas de compra da vaga vazia
 * (com o id que as desmarca). Set, Pokédex e customizada, o mesmo formato.
 *
 * Só lê. A montagem e o porquê de cada campo estão em
 * `lib/dominio/grade-colecao.ts`; o contrato, em `docs/design-v2/`. As
 * candidatas de compra não vêm aqui: são milhares numa Pokédex, e a leitura
 * do "o que falta" as traz sob demanda.
 */
export const GET = comAcesso(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  const grade = await lerGradeDaColecao(db, id);
  if (!grade) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  return NextResponse.json(grade);
});
