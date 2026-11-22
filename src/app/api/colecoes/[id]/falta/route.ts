import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import { criterioPadrao, lerFaltaDaColecao } from "@/lib/db/falta-colecao";
import { lerCriterioDaUrl } from "@/lib/dominio/falta-colecao";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/falta — o "o que falta" enxuto da v2: por vaga vazia,
 * a carta que "marcar a melhor de cada vaga" proporia e o critério, o preço
 * com fonte, data e cotação, as escolhas atuais (com o id que as desmarca),
 * quantas alternativas há — e a lista para colar em abas, pela mesma
 * montagem da tela de opções (`resumoDaListaDeCompra`).
 *
 * `?ordenacao=preferencia|preco&teto=<reais>` muda o critério na fonte
 * Cardmarket, como o filtro da tela de opções (sem rodada nova); sem eles,
 * vale o padrão da tela de opções para o tipo. Na fonte Liga o critério é o
 * da última varredura, e os dois parâmetros não mudam nada.
 *
 * Só lê: não dispara busca de preço nem fecha rodada morta. Customizada não
 * tem vaga vazia no sentido de "carta que falta" e devolve a lista vazia. A
 * montagem está em `lib/dominio/falta-colecao.ts`; o contrato, em
 * `docs/design-v2/`.
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

  const fonte = fonteDePreco();
  if (colecao.tipo !== "pokedex" && colecao.tipo !== "set") {
    return NextResponse.json({
      colecaoId: colecao.id,
      tipo: colecao.tipo,
      fonte,
      criterio: null,
      estado: null,
      vagas: [],
      lista: null,
    });
  }

  const criterio = lerCriterioDaUrl(
    new URL(req.url).searchParams,
    criterioPadrao(colecao.tipo),
    colecao.tipo === "set" ? "preco" : null,
  );
  if (!criterio.ok) {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }

  return NextResponse.json(
    await lerFaltaDaColecao(
      db,
      { id: colecao.id, tipo: colecao.tipo, parametro: colecao.parametro },
      fonte,
      criterio,
    ),
  );
});
