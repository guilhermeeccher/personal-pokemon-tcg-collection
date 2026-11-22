import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import { criterioPadrao, lerAlternativasDaVaga } from "@/lib/db/falta-colecao";
import { lerCriterioDaUrl } from "@/lib/dominio/falta-colecao";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import { corpoRecusa } from "@/lib/dominio/recusa";
import type { AlternativasDaVagaV2DTO } from "@/lib/dominio/tipos-cliente";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/falta/alternativas?chave=<chave da vaga> — todas as
 * opções de compra de UMA vaga vazia, com foto, na ordem do critério e com a
 * marcação de cada uma: o que a aba "O que falta" abre quando a vaga tem
 * várias cartas possíveis (Pokédex), não tem preço ainda, ou já tem escolhas.
 *
 * Mesmos `ordenacao` e `teto` de `GET .../falta`, e as mesmas opções que a
 * tela de opções mostraria para essa vaga — a mesma montagem. Só lê. Vaga
 * que não existe, ou que já foi preenchida, é 404.
 */
export const GET = comAcesso(async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }
  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    return NextResponse.json(corpoRecusa("vagaNaoEncontrada"), { status: 404 });
  }

  const busca = new URL(req.url).searchParams;
  const chave = busca.get("chave");
  if (chave === null || chave === "" || chave.length > 200) {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }
  const criterio = lerCriterioDaUrl(
    busca,
    criterioPadrao(colecao.tipo),
    colecao.tipo === "set" ? "preco" : null,
  );
  if (!criterio.ok) {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }

  const alternativas = await lerAlternativasDaVaga(
    db,
    { id: colecao.id, tipo: colecao.tipo, parametro: colecao.parametro },
    fonteDePreco(),
    chave,
    criterio,
  );
  if (!alternativas) {
    return NextResponse.json(corpoRecusa("vagaNaoEncontrada"), { status: 404 });
  }
  const corpo: AlternativasDaVagaV2DTO = alternativas;
  return NextResponse.json(corpo);
});
