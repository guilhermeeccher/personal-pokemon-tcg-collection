/**
 * O envio do Novo cadastro (`POST /api/dex/registros/enviar`), sem React e
 * sem `fetch`: o corpo do pedido, a leitura da resposta e a sequência da
 * confirmação de saída sem volta. Módulo puro, testado passo a passo
 * (`fluxo-envio.test.ts`); a tela só injeta o POST e desenha o estado.
 *
 * A regra que importa mora aqui, e não no componente (AGENTS.md, "New
 * registration sends straight to HOME"):
 *
 * - **A primeira tentativa vai sempre com `confirmarSemVolta: false`.** Um
 *   jogo só de envio (GO, FireRed) responde 409 `dexConfirmarSemVolta`, uma
 *   vez para o lote inteiro; isso não é erro, é a pergunta.
 * - **Só `confirmar()` manda `true`**, com o mesmo jogo e os mesmos itens do
 *   pedido que a rota recusou — nunca o lote da tela de agora, que a pessoa
 *   poderia ter mexido. Só o clique em "Transferir" o chama: a confirmação
 *   nunca é automática.
 * - **Cancelar não envia nada**, e um 409 da mesma chave a um pedido que já
 *   ia confirmado é recusa comum, nunca uma segunda pergunta (a confirmação
 *   não gira em círculo).
 * - **Um pedido por vez**: com um em voo, `enviar` e `confirmar` não fazem
 *   nada, para dois cliques não virarem dois lotes. Quem serializa de verdade
 *   é a rota (`pg_advisory_xact_lock` em `enviarAoHome`): duas abas mandando
 *   a mesma vaga, a segunda a encontra no HOME e recebe `dexVagaJaNoHome`.
 *
 * É o mesmo desenho de `criarFluxoMover` (`_comum/dex/mover-registros.ts`),
 * com o pedido do envio: um jogo de saída e itens por vaga e trilha, em vez
 * de ids de registros e um destino.
 */
import { RECUSA_CONFIRMAR_SEM_VOLTA, type RespostaHttp } from "@/app/_comum/dex/mover-registros";

export interface ItemEnvio {
  formaId: string;
  shiny: boolean;
}

export interface PedidoEnvio {
  /** O jogo de onde os Pokémon saem agora, ou `home`. Não é a origem histórica (ver a rota). */
  jogoOrigem: string;
  itens: readonly ItemEnvio[];
}

/** O corpo do POST, no formato da rota. `confirmado` só é `true` depois do clique em confirmar. */
export function corpoDoEnvio(pedido: PedidoEnvio, confirmado: boolean): string {
  return JSON.stringify({
    jogoOrigem: pedido.jogoOrigem,
    itens: pedido.itens.map((i) => ({ formaId: i.formaId, shiny: i.shiny })),
    confirmarSemVolta: confirmado,
  });
}

export type RespostaEnvio =
  | { tipo: "ok"; criados: number; movidos: number }
  /** A rota quer a confirmação de saída sem volta; `corpo` traz a frase (com o jogo). */
  | { tipo: "confirmar"; corpo: unknown }
  /** Qualquer outra resposta não 2xx: `corpo` vai para as recusas legíveis. */
  | { tipo: "recusa"; corpo: unknown };

/**
 * Lê a resposta. O 201 traz `{ criados, movidos }`; sem eles (um proxy que
 * reescreveu o corpo), conta o lote inteiro como criado, como a v1 fazia —
 * o envio aconteceu, só a divisão entre criado e movido se perdeu.
 */
export function lerRespostaEnvio(status: number, corpo: unknown, confirmado: boolean, total: number): RespostaEnvio {
  if (status >= 200 && status < 300) {
    const { criados, movidos } = (corpo ?? {}) as { criados?: unknown; movidos?: unknown };
    return typeof criados === "number" && typeof movidos === "number"
      ? { tipo: "ok", criados, movidos }
      : { tipo: "ok", criados: total, movidos: 0 };
  }
  const chave = (corpo as { recusa?: { chave?: unknown } } | null)?.recusa?.chave;
  if (status === 409 && chave === RECUSA_CONFIRMAR_SEM_VOLTA && !confirmado) return { tipo: "confirmar", corpo };
  return { tipo: "recusa", corpo };
}

export interface EstadoFluxoEnvio {
  /** O pedido que espera a confirmação, com o corpo do 409 (a frase sai dele). */
  pendente: (PedidoEnvio & { corpo: unknown }) | null;
  ocupado: boolean;
  /** A última recusa, ou `"rede"` quando o pedido nem teve resposta; nulo depois de um sucesso. */
  falha: RespostaHttp | "rede" | null;
}

export type ResultadoFluxoEnvio =
  | { tipo: "ok"; criados: number; movidos: number; pedido: PedidoEnvio }
  | { tipo: "pendente" }
  | { tipo: "recusa"; status: number }
  | { tipo: "rede" }
  /** Nada saiu: havia um pedido em voo, ou nada pendente para confirmar. */
  | { tipo: "ignorado" };

export interface FluxoEnvio {
  enviar: (pedido: PedidoEnvio) => Promise<ResultadoFluxoEnvio>;
  /** Reenvia o pendente com a confirmação. Só o clique em confirmar o chama. */
  confirmar: () => Promise<ResultadoFluxoEnvio>;
  /** Descarta o pendente sem enviar nada. */
  cancelar: () => void;
  estado: () => EstadoFluxoEnvio;
}

/**
 * O fluxo inteiro do envio. Uma falha de rede ao confirmar mantém o pendente
 * (o diálogo continua aberto para tentar de novo ou cancelar), como no fluxo
 * de mover; qualquer resposta da rota o encerra.
 */
export function criarFluxoEnvio(dep: {
  post: (corpo: string) => Promise<RespostaHttp>;
  aoMudar: (estado: EstadoFluxoEnvio) => void;
}): FluxoEnvio {
  let estado: EstadoFluxoEnvio = { pendente: null, ocupado: false, falha: null };
  const mudar = (parcial: Partial<EstadoFluxoEnvio>) => {
    estado = { ...estado, ...parcial };
    dep.aoMudar(estado);
  };

  async function postar(pedido: PedidoEnvio, confirmado: boolean): Promise<ResultadoFluxoEnvio> {
    if (estado.ocupado) return { tipo: "ignorado" };
    mudar({ ocupado: true, falha: null });
    let resposta: RespostaHttp;
    try {
      resposta = await dep.post(corpoDoEnvio(pedido, confirmado));
    } catch {
      mudar({ ocupado: false, falha: "rede" });
      return { tipo: "rede" };
    }
    const lida = lerRespostaEnvio(resposta.status, resposta.corpo, confirmado, pedido.itens.length);
    if (lida.tipo === "confirmar") {
      mudar({ ocupado: false, pendente: { ...pedido, corpo: lida.corpo } });
      return { tipo: "pendente" };
    }
    if (lida.tipo === "recusa") {
      mudar({ ocupado: false, pendente: null, falha: resposta });
      return { tipo: "recusa", status: resposta.status };
    }
    mudar({ ocupado: false, pendente: null });
    return { tipo: "ok", criados: lida.criados, movidos: lida.movidos, pedido };
  }

  return {
    // Uma cópia dos itens: o pedido pendente não muda se a tela mexer no array dela.
    enviar: (pedido) => postar({ jogoOrigem: pedido.jogoOrigem, itens: pedido.itens.map((i) => ({ ...i })) }, false),
    confirmar: async () => {
      const p = estado.pendente;
      return p ? postar({ jogoOrigem: p.jogoOrigem, itens: p.itens }, true) : { tipo: "ignorado" };
    },
    cancelar: () => {
      if (estado.pendente && !estado.ocupado) mudar({ pendente: null });
    },
    estado: () => estado,
  };
}
