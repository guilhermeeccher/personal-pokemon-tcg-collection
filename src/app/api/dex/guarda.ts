import { NextResponse } from "next/server";

import { moduloLivingDexAtivo } from "@/lib/modulos";

/**
 * Guarda comum das rotas `/api/dex/...`: com o módulo desligado, a rota não
 * existe (404), e nada do banco é lido. Devolve a resposta pronta, ou `null`
 * para seguir.
 */
export function respostaSeModuloDesligado(): NextResponse | null {
  return moduloLivingDexAtivo() ? null : NextResponse.json({ erro: "Not found." }, { status: 404 });
}

/** Lê o JSON do corpo; `undefined` = corpo malformado. */
export async function lerCorpoJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const respostaCorpoInvalido = () =>
  NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
