import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { inserirLoteCopias, obterVariantesDisponiveisPorCarta } from "@/lib/db/consultas";
import { validarLoteCopias } from "@/lib/dominio/lote-copias";
import { corpoRecusa } from "@/lib/dominio/recusa";
import { validarVariantesContraCatalogo } from "@/lib/dominio/variantes-catalogo";

/**
 * POST /api/sets/:setId/copias — grava a grade inteira do cadastro rápido
 * por set numa única submissão (critério de aceite da Fase 1). O `setId`
 * da URL é só para o path ficar expressivo; a identidade de cada carta
 * (`cartaId` + `idiomaCatalogo`) já vem validada no corpo e é o que a FK
 * do banco de fato checa — se algum `cartaId` não existir no catálogo com
 * o `idiomaCatalogo` informado, o INSERT falha e a submissão inteira é
 * rejeitada (tudo ou nada).
 *
 * Segunda passada, depois da validação estrutural: cada variante
 * escolhida precisa existir de fato no catálogo para aquela carta
 * (decisão tomada na validação real: o fichário tinha o Base Set
 * inteiro gravado como "normal", incluindo cartas que só existem em
 * holo). A interface já restringe isso, mas o servidor é quem garante —
 * interface que restringe sem servidor que valida não é restrição.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  await params; // setId não é usado na validação — mantido só pelo path.

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarLoteCopias(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json(
      { ...corpoRecusa("loteInvalido"), detalhes: resultado.erros },
      { status: 400 },
    );
  }

  const cartaIds = [...new Set(resultado.copias.map((c) => c.cartaId))];
  const variantesPorCarta = await obterVariantesDisponiveisPorCarta(
    db,
    resultado.idiomaCatalogo,
    cartaIds,
  );
  const errosVariante = validarVariantesContraCatalogo(resultado.copias, variantesPorCarta);
  if (errosVariante.length > 0) {
    return NextResponse.json(
      { ...corpoRecusa("varianteForaDoCatalogoNoLote"), detalhes: errosVariante },
      { status: 400 },
    );
  }

  try {
    const { inseridas, fundidas } = await inserirLoteCopias(db, resultado.copias);
    return NextResponse.json({ inseridas, fundidas }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/sets/:setId/copias] falha ao inserir lote:", err);
    return NextResponse.json(
      corpoRecusa("falhaAoGravarLote"),
      { status: 400 },
    );
  }
}
