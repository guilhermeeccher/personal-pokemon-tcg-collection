import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarCartasRepetidas } from "@/lib/db/consultas";
import { validarFiltrosRepetidas } from "@/lib/dominio/filtros-repetidas";

/**
 * GET /api/inventario/repetidas — item 2 ("o que sobra para troca").
 * `total >= 2` é a definição fechada de repetida; `soLivres=true` estreita
 * para `livres >= 1`. Paginado — ver `listarCartasRepetidas` para as
 * consultas e por que escalam.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resultado = validarFiltrosRepetidas({
    soLivres: url.searchParams.get("soLivres"),
    pagina: url.searchParams.get("pagina"),
    tamanhoPagina: url.searchParams.get("tamanhoPagina"),
  });

  if (!resultado.ok) {
    return NextResponse.json({ erro: "Filtros inválidos.", detalhes: resultado.erros }, { status: 400 });
  }

  const { itens, total } = await listarCartasRepetidas(db, resultado.filtros);

  return NextResponse.json({
    itens,
    total,
    pagina: resultado.filtros.pagina,
    tamanhoPagina: resultado.filtros.tamanhoPagina,
  });
}
