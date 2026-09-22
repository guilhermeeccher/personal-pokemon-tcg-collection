import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { criarCartaManual } from "@/lib/db/consultas";
import { validarCartaManual } from "@/lib/dominio/carta-manual";
import { corpoDasRecusas } from "@/lib/dominio/recusa";

/**
 * POST /api/cartas/manual — cria uma linha de catálogo à mão, para carta
 * que a TCGdex não tem em fonte nenhuma (caso do `SMH`, GX Starter Decks
 * japonês). Ver `lib/dominio/carta-manual.ts`.
 *
 * A carta criada vira uma linha normal de `carta_catalogo`, marcada com
 * `origem = 'manual'`: dali em diante ela é cadastrável, alocável em vaga
 * e exportável como qualquer outra — e o sync nunca a inativa.
 */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const validacao = validarCartaManual(
    (corpo ?? {}) as Record<string, unknown>,
  );
  if (!validacao.ok) {
    return NextResponse.json(corpoDasRecusas(validacao.erros), { status: 400 });
  }

  const { cartaId, jaExistia } = await criarCartaManual(db, validacao.carta);

  return NextResponse.json(
    { ok: true, cartaId, idioma: validacao.carta.idioma, jaExistia },
    { status: jaExistia ? 200 : 201 },
  );
}
