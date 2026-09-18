import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { contarCopiasPorCartaId, obterGradeDoSet } from "@/lib/db/consultas";

/**
 * GET /api/sets/:setId/cartas — grade de cadastro rápido de um set. O
 * idioma de catálogo (pt ou fallback en, regra 7 do AGENTS.md) é resolvido
 * no servidor e devolvido explícito na resposta (`idiomaCatalogo`,
 * `temPt`), para a interface deixar claro qual catálogo está em uso.
 *
 * Cada carta vem com `qtdPossuida` (item 3 — aviso de carta repetida):
 * uma única consulta em lote (`contarCopiasPorCartaId`) para o set
 * inteiro, nunca uma por carta.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  const grade = await obterGradeDoSet(db, setId);
  if (!grade) {
    return NextResponse.json({ erro: "Set não encontrado." }, { status: 404 });
  }
  const contagens = await contarCopiasPorCartaId(db, grade.cartas.map((c) => c.cartaId));
  return NextResponse.json({
    ...grade,
    cartas: grade.cartas.map((c) => ({ ...c, qtdPossuida: contagens[c.cartaId] ?? 0 })),
  });
}
