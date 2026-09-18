import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { atualizarCopiasEmMassa } from "@/lib/db/consultas";
import { validarEdicaoEmMassa } from "@/lib/dominio/edicao-massa";

/**
 * PATCH /api/copias/massa — item 2 do incremento pós-Fase 3: edição em
 * massa no inventário. Body: `{ copiaIds: string[], patch: { condicao?,
 * localizacao?, idioma?, variante? } }`.
 *
 * Caminho estático (`/massa`), não colide com a rota dinâmica
 * `/api/copias/:id` — Next.js App Router resolve o segmento estático
 * antes do dinâmico no mesmo nível.
 *
 * Atômico: `atualizarCopiasEmMassa` roda tudo numa transação — ou todas
 * as cópias selecionadas mudam, ou nenhuma (inclusive quando a variante
 * pedida não existe no catálogo de alguma das cartas selecionadas).
 * Nunca mexe em alocação (não é responsabilidade desta rota nem da
 * consulta que ela chama).
 */
export async function PATCH(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarEdicaoEmMassa(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Edição em massa inválida.", detalhes: resultado.erros }, { status: 400 });
  }

  const { copiaIds, patch } = resultado.edicao;
  const aplicado = await atualizarCopiasEmMassa(db, copiaIds, patch);
  if (!aplicado.ok) {
    return NextResponse.json(
      { erro: aplicado.motivo, detalhes: aplicado.detalhes },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, atualizadas: aplicado.atualizadas });
}
