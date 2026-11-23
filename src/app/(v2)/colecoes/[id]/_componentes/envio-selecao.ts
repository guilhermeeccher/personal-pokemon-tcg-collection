"use client";

import { type CorpoSelecao, type DesfechoDaSelecao, desfechoDaSelecao, tamanhoDoCorpo } from "./compra-falta";
import { criarFilaPorChave } from "./fila-por-chave";

/** Uma fila por coleção, de toda a página: a aba e o detalhe escrevem pela mesma. */
const filaDaColecao = criarFilaPorChave();

/**
 * Envia marcações por `PATCH /api/colecoes/:id/opcoes-compra/selecao`, a rota
 * da v1, **um pedido de cada vez por coleção**, venha da aba ou do detalhe:
 * um "tirar" que saísse junto de um "pôr" na mesma vaga poderia chegar antes
 * dele. Para no primeiro recusado (o que vem depois foi pensado sobre um
 * estado que não existe mais); um pedido que mudou menos do que pediu deixa
 * os outros seguirem e volta como `parcial`.
 *
 * `aindaVale`, quando dado, é perguntado na hora em que chega a vez do
 * pedido: a aba entra na fila no gesto, e uma recusa no meio do caminho
 * descarta o que ela já tinha posto atrás (volta `null`, nada enviado).
 */
export function enviarSelecao(
  colecaoId: string,
  corpos: readonly CorpoSelecao[],
  aindaVale?: () => boolean,
): Promise<DesfechoDaSelecao | null> {
  return filaDaColecao(colecaoId, () => (aindaVale && !aindaVale() ? Promise.resolve(null) : enviarAgora(colecaoId, corpos)));
}

async function enviarAgora(colecaoId: string, corpos: readonly CorpoSelecao[]): Promise<DesfechoDaSelecao> {
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
