import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarSeriesParaGrupo } from "@/lib/db/grupos-colecao";

/**
 * GET /api/grupos-colecao/series — as séries ocidentais (pt/en) que um grupo
 * pode ligar, na ordem do seletor de expansão: `{ series: [{ serieId,
 * rotulo, sets }] }`. Só lê o catálogo.
 */
export const GET = comAcesso(async function GET() {
  return NextResponse.json({ series: await listarSeriesParaGrupo(db) });
});
