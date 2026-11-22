import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { dispensarSugestao } from "@/lib/db/sugestoes";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { lerDispensa } from "@/lib/dominio/sugestoes-colecao";

/**
 * POST /api/sugestoes/dispensar — "Não tenho interesse": `{ tipo, valor }`
 * (`DispensarSugestaoDTO`). A sugestão some para sempre (`sugestao_dispensada`).
 * Dispensar de novo é 200 do mesmo jeito. Tipo desconhecido ou valor que não
 * vale para o tipo: 400 `sugestaoInvalida`; corpo que não é JSON: 400
 * `corpoInvalido`.
 */
export const POST = comAcesso(async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }
  const leitura = lerDispensa(corpo);
  if (!leitura.ok) return NextResponse.json(corpoDaRecusa(leitura.recusa), { status: 400 });
  await dispensarSugestao(db, leitura.tipo, leitura.valor);
  return NextResponse.json({ ok: true });
});
