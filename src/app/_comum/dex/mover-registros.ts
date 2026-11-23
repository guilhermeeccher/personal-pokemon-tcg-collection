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

/** O que o POST devolveu: o status e o corpo já lido (nulo quando não era JSON). */
export interface RespostaHttp {
  status: number;
  corpo: unknown;
}

export interface EstadoFluxoMover {
  /** O pedido que espera a confirmação, com o corpo do 409 (a frase sai dele). */
  pendente: (PedidoMover & { corpo: unknown }) | null;
  ocupado: boolean;
  /** A última recusa, ou `"rede"` quando o pedido nem teve resposta; nulo depois de um sucesso. */
  falha: RespostaHttp | "rede" | null;
}

/** Como terminou uma chamada do fluxo; quem usa decide o que fazer com cada caso. */
export type ResultadoFluxoMover =
  | { tipo: "ok"; movidos: number }
  | { tipo: "pendente" }
  | { tipo: "recusa"; status: number }
  | { tipo: "rede" }
  /** Nada saiu: havia um pedido em voo, ou nada pendente para confirmar. */
  | { tipo: "ignorado" };

export interface FluxoMover {
  mover: (ids: readonly string[], local: string) => Promise<ResultadoFluxoMover>;
  /** Reenvia o pendente com a confirmação. Só o clique em confirmar o chama. */
  confirmar: () => Promise<ResultadoFluxoMover>;
  /** Descarta o pendente sem enviar nada. */
  cancelar: () => void;
  estado: () => EstadoFluxoMover;
}

/**
 * O fluxo inteiro de mover, sem React e sem `fetch`: quem usa injeta o POST e
 * ouve as mudanças. É aqui, e não no hook, que mora a regra que importa — a
 * primeira tentativa vai sem confirmação, o 409 de saída sem volta para e
 * espera, cancelar não envia nada e só `confirmar()` manda `true`, com os
 * mesmos ids e destino —, para um teste poder segui-la passo a passo.
 *
 * Um pedido por vez: com um em voo, `mover` e `confirmar` não fazem nada.
 * Uma falha de rede mantém o pendente (a janela continua aberta para tentar de
 * novo ou cancelar), como sempre foi na v1.
 */
export function criarFluxoMover(dep: {
  post: (corpo: string) => Promise<RespostaHttp>;
  aoMudar: (estado: EstadoFluxoMover) => void;
}): FluxoMover {
  let estado: EstadoFluxoMover = { pendente: null, ocupado: false, falha: null };
  const mudar = (parcial: Partial<EstadoFluxoMover>) => {
    estado = { ...estado, ...parcial };
    dep.aoMudar(estado);
  };

  async function enviar(pedido: PedidoMover, confirmado: boolean): Promise<ResultadoFluxoMover> {
    if (estado.ocupado) return { tipo: "ignorado" };
    mudar({ ocupado: true, falha: null });
    let resposta: RespostaHttp;
    try {
      resposta = await dep.post(corpoDoMover(pedido, confirmado));
    } catch {
      mudar({ ocupado: false, falha: "rede" });
      return { tipo: "rede" };
    }
    const lida = lerRespostaMover(resposta.status, resposta.corpo, confirmado);
    if (lida.tipo === "confirmar") {
      mudar({ ocupado: false, pendente: { ids: pedido.ids, local: pedido.local, corpo: lida.corpo } });
      return { tipo: "pendente" };
    }
    if (lida.tipo === "recusa") {
      mudar({ ocupado: false, pendente: null, falha: resposta });
      return { tipo: "recusa", status: resposta.status };
    }
    mudar({ ocupado: false, pendente: null });
    return { tipo: "ok", movidos: lida.movidos };
  }

  return {
    mover: (ids, local) => enviar({ ids: [...ids], local }, false),
    confirmar: async () =>
      estado.pendente ? enviar({ ids: estado.pendente.ids, local: estado.pendente.local }, true) : { tipo: "ignorado" },
    cancelar: () => {
      if (estado.pendente) mudar({ pendente: null });
    },
    estado: () => estado,
  };
}
