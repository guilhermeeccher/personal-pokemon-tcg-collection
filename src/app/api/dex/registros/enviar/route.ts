import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { enviarAoHome } from "@/lib/db/dex";
import { lerLoteEnvioHome } from "@/lib/dominio/dex-envio-home";
import { corpoDaRecusa, corpoDasRecusas } from "@/lib/dominio/recusa";

import { lerCorpoJson, respostaSeModuloDesligado } from "../../guarda";

/**
 * POST /api/dex/registros/enviar — Novo cadastro: `{ jogoOrigem, itens:
 * [{ formaId, shiny }], confirmarSemVolta? }`. Cada item é um Pokémon que
 * chega ao HOME, "a guardar", saindo de `jogoOrigem` (um jogo ativo do
 * usuário, ou `home`): o registro que já está nesse jogo é movido, mantendo a
 * origem histórica; sem ele, um novo nasce lá. Um item por vaga e trilha.
 *
 * 201 `{ ok, criados, movidos }`; 400 `{ erro }` para corpo malformado e
 * `{ recusas }` para as recusas, todas juntas, sem nada gravado. Sair de um
 * jogo só de envio (GO, FireRed) volta 409 com a recusa `dexConfirmarSemVolta`
 * até a tela reenviar com `confirmarSemVolta: true` — a confirmação de que o
 * Pokémon não volta é do usuário, nunca da rota.
 */
export const POST = comAcesso(async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const lote = lerLoteEnvioHome(await lerCorpoJson(req));
  if (typeof lote === "string") return NextResponse.json({ erro: lote }, { status: 400 });

  const r = await enviarAoHome(db, lote);
  if (!r.ok) {
    return "motivo" in r
      ? NextResponse.json(corpoDaRecusa(r.motivo), { status: r.status })
      : NextResponse.json(corpoDasRecusas(r.recusas), { status: r.status });
  }
  return NextResponse.json({ ok: true, criados: r.criados, movidos: r.movidos }, { status: 201 });
});
