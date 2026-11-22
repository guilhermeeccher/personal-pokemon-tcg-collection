import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { alocarCartasDoTema, listarCartasDoTema } from "@/lib/db/cartas-do-tema";
import { lerPedidoCartasDoTema } from "@/lib/dominio/cartas-do-tema";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { canonizarUuid, ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/cartas-do-tema — "Suas cartas que cabem neste tema"
 * (`CartasDoTemaDTO`): as cópias livres que cabem no tema da coleção temática,
 * uma por carta física vindo marcada. Só lê — a lista nunca aloca sozinha.
 * 400 `colecaoSemTema` quando a coleção não é temática.
 */
export const GET = comAcesso(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  const r = await listarCartasDoTema(db, id);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json(r.resultado);
});

/**
 * POST /api/colecoes/:id/cartas-do-tema —
 * `{ itens: [{ copiaId, quantidade, jaNaColecao }], permitirForaDePadrao? }`
 * (`AlocarCartasDoTemaDTO`, 1 a 500): aloca as cópias marcadas numa transação
 * só, uma vaga por cópia, pelo caminho de alocação da customizada. Cada item
 * traz o que a prévia mostrou, conferido sob a trava. Tudo ou nada: cópia que
 * outra aba alocou, dividiu ou apagou, ou carta que entrou na coleção desde a
 * prévia, é 409 e nada é gravado; cópia que não cabe no tema é 400
 * `copiaForaDoTema`. Corpo malformado: 400 com recusa (`corpoInvalido`,
 * `pedidoDeCartasDoTemaInvalido`, `copiaRepetidaNoPedido`).
 * 201 `{ vagas: [{ copiaId, vagaId, chave }] }`.
 */
export const POST = comAcesso(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = canonizarUuid((await params).id);
  if (!ehUuid(id)) return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }
  const leitura = lerPedidoCartasDoTema(corpo);
  if (!leitura.ok) {
    const recusa = "recusa" in leitura ? leitura.recusa : { chave: "pedidoDeCartasDoTemaInvalido" };
    return NextResponse.json(corpoDaRecusa(recusa), { status: 400 });
  }
  const r = await alocarCartasDoTema(db, id, leitura.valor);
  if (!r.ok) return NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status });
  return NextResponse.json({ vagas: r.vagas }, { status: 201 });
});
