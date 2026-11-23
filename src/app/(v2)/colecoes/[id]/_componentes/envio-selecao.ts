"use client";

import { type CorpoSelecao, type DesfechoDaSelecao, desfechoDaSelecao, tamanhoDoCorpo } from "./compra-falta";

/**
 * Envia marcações por `PATCH /api/colecoes/:id/opcoes-compra/selecao`, a rota
 * da v1, **um pedido de cada vez**: um "tirar" que saísse junto de um "pôr"
 * na mesma vaga poderia chegar antes dele. Para no primeiro recusado (o que
 * vem depois foi pensado sobre um estado que não existe mais); um pedido que
 * mudou menos do que pediu deixa os outros seguirem e volta como `parcial`.
 */
export async function enviarSelecao(colecaoId: string, corpos: readonly CorpoSelecao[]): Promise<DesfechoDaSelecao> {
  let parcial = false;
  for (const corpo of corpos) {
    let status: number;
    let alteradas: number | null = null;
    try {
      const r = await fetch(`/api/colecoes/${colecaoId}/opcoes-compra/selecao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      status = r.status;
      const json = (await r.json().catch(() => null)) as { alteradas?: unknown } | null;
      if (typeof json?.alteradas === "number") alteradas = json.alteradas;
    } catch {
      return { tipo: "recusada", motivo: "rede" };
    }
    const desfecho = desfechoDaSelecao(status, alteradas, tamanhoDoCorpo(corpo));
    if (desfecho.tipo === "recusada") return desfecho;
    if (desfecho.tipo === "parcial") parcial = true;
  }
  return parcial ? { tipo: "parcial" } : { tipo: "ok" };
}
