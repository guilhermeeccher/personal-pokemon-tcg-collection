/**
 * Mover registros da Living Dex (`POST /api/dex/registros/mover`) — a parte
 * sem pele, que a v1 e a v2 usam igual. Módulo puro: o corpo do pedido e a
 * leitura da resposta. O hook está em `use-mover-registros.ts`; a janela de
 * confirmação é de cada versão (o `Modal` da v1, o diálogo de confirmação da
 * v2).
 *
 * A rota responde 409 com `dexConfirmarSemVolta` quando algum registro sai de
 * um jogo só de envio (GO, FireRed). Só essa recusa vira pedido de
 * confirmação; e o corpo com `confirmarSemVolta: true` só é montado quando a
 * pessoa clicou em confirmar — nunca na primeira tentativa, nunca sozinho
 * (AGENTS.md, "Optional module: Living Dex").
 */

/** A chave da recusa que pede a confirmação de saída sem volta. */
export const RECUSA_CONFIRMAR_SEM_VOLTA = "dexConfirmarSemVolta";

export interface PedidoMover {
  ids: readonly string[];
  /** `home` ou o id de um jogo do catálogo (`dex-jogos.ts`). */
  local: string;
}

/** O corpo do POST. `confirmado` só é `true` depois do clique em confirmar. */
export function corpoDoMover(pedido: PedidoMover, confirmado: boolean): string {
  return JSON.stringify({ ids: pedido.ids, local: pedido.local, confirmarSemVolta: confirmado });
}

export type RespostaMover =
  | { tipo: "ok"; movidos: number }
  /** A rota quer a confirmação de saída sem volta; `corpo` traz a frase (com o jogo). */
  | { tipo: "confirmar"; corpo: unknown }
  /** Qualquer outra recusa (400, 404, 409 sem a chave acima, 5xx): a tela mostra a frase. */
  | { tipo: "recusa"; corpo: unknown };

/**
 * Lê a resposta. Um 409 só pede confirmação quando a chave é exatamente a de
 * saída sem volta: outro 409 é recusa como as outras. Um 409 de confirmação
 * a um pedido que já ia confirmado também é recusa — repetir a pergunta
 * faria a confirmação girar em círculo.
 */
export function lerRespostaMover(status: number, corpo: unknown, confirmado: boolean): RespostaMover {
  if (status >= 200 && status < 300) {
    const movidos = (corpo as { movidos?: unknown } | null)?.movidos;
    return { tipo: "ok", movidos: typeof movidos === "number" ? movidos : 0 };
  }
  const chave = (corpo as { recusa?: { chave?: unknown } } | null)?.recusa?.chave;
  if (status === 409 && chave === RECUSA_CONFIRMAR_SEM_VOLTA && !confirmado) return { tipo: "confirmar", corpo };
  return { tipo: "recusa", corpo };
}
