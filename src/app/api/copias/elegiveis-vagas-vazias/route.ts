import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { contarCopiasElegiveisParaVagasVazias } from "@/lib/db/consultas";

/**
 * GET /api/copias/elegiveis-vagas-vazias — item 3: quantas cópias
 * LIVRES do inventário são elegíveis para vagas VAZIAS de alguma
 * coleção pokedex/set. Alimenta o aviso na lista de coleções ("você tem
 * cartas que preenchem vagas vazias"). Só conta e informa — regra 5 do
 * AGENTS.md: o sistema nunca aloca sozinho.
 */
export async function GET() {
  const contagem = await contarCopiasElegiveisParaVagasVazias(db);
  return NextResponse.json(contagem);
}
