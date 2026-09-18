import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { buscarCartas, contarCopiasPorCartaId } from "@/lib/db/consultas";

/**
 * GET /api/cartas?nome=&set=&numero=&sigla= — busca de carta avulsa (spec
 * §5 Fase 1, "cadastro por busca"). Ao menos um parâmetro é exigido,
 * senão a busca varreria o catálogo inteiro (34 mil linhas) sem
 * necessidade. `sigla` é a sigla impressa na carta (ex.: "MEW"); junto
 * com `numero` resolve a busca "sigla + número numa entrada só" — o
 * parsing de "MEW 151" em `{ sigla, numero }` é feito no cliente (mesma
 * função pura usada nos testes, `lib/dominio/busca-carta.ts`), esta rota
 * só recebe os dois já separados.
 *
 * Cada carta encontrada vem com `qtdPossuida` (item 3 — aviso de carta
 * repetida): uma única consulta em lote para todos os resultados.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nome = url.searchParams.get("nome")?.trim() || undefined;
  const setId = url.searchParams.get("set")?.trim() || undefined;
  const numero = url.searchParams.get("numero")?.trim() || undefined;
  const sigla = url.searchParams.get("sigla")?.trim() || undefined;

  if (!nome && !setId && !numero && !sigla) {
    return NextResponse.json({ cartas: [] });
  }

  const cartas = await buscarCartas(db, { nome, setId, numero, sigla });
  const contagens = await contarCopiasPorCartaId(db, cartas.map((c) => c.cartaId));
  return NextResponse.json({
    cartas: cartas.map((c) => ({ ...c, qtdPossuida: contagens[c.cartaId] ?? 0 })),
  });
}
