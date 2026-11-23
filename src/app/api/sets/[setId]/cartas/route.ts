import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { contarCopiasPorCartaId, obterGradeDoSet } from "@/lib/db/consultas";
import { lerCatalogoPedido } from "@/lib/dominio/catalogo-grade-set";

/**
 * GET /api/sets/:setId/cartas — grade de cadastro rápido de um set. O
 * idioma de catálogo (pt ou fallback en, regra 7 do AGENTS.md) é resolvido
 * no servidor e devolvido explícito na resposta (`idiomaCatalogo`,
 * `temPt`), para a interface deixar claro qual catálogo está em uso.
 *
 * `?catalogo=jp` pede a grade japonesa de um set que existe nos dois
 * catálogos (`neo1` a `neo4`, mesmo `set_id`, outras cartas): só fichas
 * japonesas, nunca o ocidental para completar. Um set sem ficha japonesa não
 * tem essa grade (404), e qualquer outro valor é recusado (400), nunca lido
 * como o padrão (`lib/dominio/catalogo-grade-set.ts`). Sem o parâmetro, a
 * resposta é a de sempre.
 *
 * Cada carta vem com `qtdPossuida` (item 3 — aviso de carta repetida):
 * uma única consulta em lote (`contarCopiasPorCartaId`) para o set
 * inteiro, nunca uma por carta.
 */
export const GET = comAcesso(async function GET(
  req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  const pedido = lerCatalogoPedido(new URL(req.url).searchParams.getAll("catalogo"));
  if (!pedido.ok) {
    // Guarda de parâmetro que a interface não emite: segue em português, em `erro`.
    return NextResponse.json({ erro: "catalogo inválido: use jp ou omita o parâmetro." }, { status: 400 });
  }
  const grade = await obterGradeDoSet(db, setId, pedido.catalogo);
  if (!grade) {
    return NextResponse.json({ erro: "Set não encontrado." }, { status: 404 });
  }
  const contagens = await contarCopiasPorCartaId(db, grade.cartas.map((c) => c.cartaId));
  return NextResponse.json({
    ...grade,
    cartas: grade.cartas.map((c) => ({ ...c, qtdPossuida: contagens[c.cartaId] ?? 0 })),
  });
});
