import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { definirSecaoDex } from "@/lib/db/dex";
import { ehSecaoLigavel } from "@/lib/dominio/dex-secoes";
import { moduloLivingDexAtivo } from "@/lib/modulos";

/**
 * PATCH /api/dex/secoes — liga ou desliga uma seção no progresso da Living
 * Dex (`{ categoria, conta }`). `base` não é ligável: conta sempre. Só muda
 * a conta; não toca registro nenhum.
 *
 * 404 com o módulo desligado, como toda rota `/api/dex/...`.
 */
export async function PATCH(req: Request) {
  if (!moduloLivingDexAtivo()) {
    return NextResponse.json({ erro: "Not found." }, { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const { categoria, conta } = (corpo ?? {}) as { categoria?: unknown; conta?: unknown };
  if (!ehSecaoLigavel(categoria)) {
    return NextResponse.json({ erro: `categoria inválida: ${String(categoria)}` }, { status: 400 });
  }
  if (typeof conta !== "boolean") {
    return NextResponse.json({ erro: `conta inválida: ${String(conta)} (esperado boolean)` }, { status: 400 });
  }

  await definirSecaoDex(db, categoria, conta);
  return NextResponse.json({ ok: true });
}
