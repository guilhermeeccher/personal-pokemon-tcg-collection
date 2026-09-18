import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarSetsParaCadastro } from "@/lib/db/consultas";

/** GET /api/sets — lista de expansões para o passo 1 do cadastro por set. */
export async function GET() {
  const sets = await listarSetsParaCadastro(db);
  return NextResponse.json({ sets });
}
