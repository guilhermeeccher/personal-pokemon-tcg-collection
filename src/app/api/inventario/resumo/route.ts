import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerResumoInventario } from "@/lib/db/resumo-inventario";

/**
 * GET /api/inventario/resumo — item 1 ("visão geral"): totais, as cinco
 * distribuições (expansão, raridade, idioma, condição, variante) e o
 * progresso das coleções. As distribuições e os totais são agregados em
 * SQL (ver comentários em `lib/db/consultas.ts`) — nenhuma traz linha por
 * cópia para somar aqui. A montagem fica em `lib/db/resumo-inventario.ts`,
 * que a visão geral da v2 também lê.
 */
export const GET = comAcesso(async function GET() {
  return NextResponse.json(await lerResumoInventario(db));
});
