import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarSugestoes } from "@/lib/db/sugestoes";

/**
 * GET /api/sugestoes — as sugestões de coleção (`ListaSugestoesDTO`), já na
 * ordem (`ordenarSugestoes`): sets e temas que o usuário já está perto de
 * ter, sem os que já têm coleção e sem os dispensados. Só lê — nada é criado
 * nem alocado sem o clique (regra 5).
 */
export const GET = comAcesso(async function GET() {
  const sugestoes = await listarSugestoes(db);
  return NextResponse.json({ sugestoes });
});
