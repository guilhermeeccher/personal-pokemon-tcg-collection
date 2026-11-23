"use client";

import { useSyncExternalStore } from "react";

import { type CorpoSelecao, type DesfechoDaSelecao, desfechoDaSelecao, tamanhoDoCorpo } from "./compra-falta";
import { criarFilaPorChave } from "./fila-por-chave";

/** Uma fila por coleção, de toda a página: a aba e o detalhe escrevem pela mesma. */
const filaDaColecao = criarFilaPorChave();

/**
 * O que a página inteira sabe dos envios de uma coleção, venham da aba ou do
 * detalhe: quantos pedidos estão na fila ou no ar; a **geração**, que sobe a
 * cada recusa (e descarta o que entrou na fila antes dela); e quantos pedidos
 * já **terminaram**, dessem certo ou não. Quem mostra a lista para colar lê
 * isto: com um pedido no ar, ou com um pedido terminado que nenhuma leitura
 * iniciada depois dele refletiu ainda, o texto está velho.
 */
interface EstadoEnvios {
  emVoo: number;
  geracao: number;
  concluidos: number;
}

const estados = new Map<string, EstadoEnvios>();
const ouvintes = new Set<() => void>();

function estadoDe(colecaoId: string): EstadoEnvios {
  let e = estados.get(colecaoId);
  if (!e) {
    e = { emVoo: 0, geracao: 0, concluidos: 0 };
    estados.set(colecaoId, e);
  }
  return e;
}

function mudar(colecaoId: string, f: (e: EstadoEnvios) => EstadoEnvios) {
  // Objeto novo a cada mudança: é a identidade que `useSyncExternalStore` compara.
  estados.set(colecaoId, f(estadoDe(colecaoId)));
  for (const o of ouvintes) o();
}

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => {
    ouvintes.delete(aviso);
  };
}

const NADA: EstadoEnvios = { emVoo: 0, geracao: 0, concluidos: 0 };

/** O estado dos envios da coleção, para desenhar. */
export function useEnvios(colecaoId: string): EstadoEnvios {
  return useSyncExternalStore(
    assinar,
    () => estadoDe(colecaoId),
    () => NADA,
  );
}

/** Quantos pedidos da coleção já terminaram, lido na hora em que uma leitura sai. */
export function enviosConcluidos(colecaoId: string): number {
  return estadoDe(colecaoId).concluidos;
}

/**
 * Envia marcações por `PATCH /api/colecoes/:id/opcoes-compra/selecao`, a rota
 * da v1, **um pedido de cada vez por coleção**, venha da aba ou do detalhe:
 * um "tirar" que saísse junto de um "pôr" na mesma vaga poderia chegar antes
 * dele. Para no primeiro recusado (o que vem depois foi pensado sobre um
 * estado que não existe mais); um pedido que mudou menos do que pediu deixa
 * os outros seguirem e volta como `parcial`.
 *
 * Uma recusa, de onde vier, sobe a geração da coleção, e todo pedido que
 * entrou na fila antes dela e ainda não saiu é descartado quando chega a vez
 * dele (volta `null`, nada enviado): a recusa do detalhe também derruba o
 * que a aba tinha posto atrás.
 */
export function enviarSelecao(colecaoId: string, corpos: readonly CorpoSelecao[]): Promise<DesfechoDaSelecao | null> {
  const geracaoNaEntrada = estadoDe(colecaoId).geracao;
  mudar(colecaoId, (e) => ({ ...e, emVoo: e.emVoo + 1 }));
  return filaDaColecao(colecaoId, async () => {
    if (estadoDe(colecaoId).geracao !== geracaoNaEntrada) return null;
    const desfecho = await enviarAgora(colecaoId, corpos);
    mudar(colecaoId, (e) => ({ ...e, concluidos: e.concluidos + 1, geracao: e.geracao + (desfecho.tipo === "recusada" ? 1 : 0) }));
    return desfecho;
  }).finally(() => mudar(colecaoId, (e) => ({ ...e, emVoo: e.emVoo - 1 })));
}

/**
 * Uma escrita da triagem que não é marcação — a confirmação do "sem estoque"
 * da tela de opções de compra (pacote 4a), que grava o registro e desmarca
 * escolhas numa transação do servidor — pela **mesma fila da coleção**: uma
 * marcação feita depois dela, nesta tela ou noutra (a aba, o detalhe), espera
 * a vez e não a ultrapassa, e ela não ultrapassa uma marcação já na fila.
 * Conta em `emVoo` enquanto espera e roda, e em `concluidos` ao terminar,
 * dê certo ou não: toda tela que mostra a lista para colar sabe que ela ficou
 * velha. Não mexe na geração — quem a chama lê o próprio resultado e relê.
 * Uma exceção da tarefa volta para quem chamou e não trava a fila.
 */
export function escreverNaFila<T>(colecaoId: string, tarefa: () => Promise<T>): Promise<T> {
  mudar(colecaoId, (e) => ({ ...e, emVoo: e.emVoo + 1 }));
  return filaDaColecao(colecaoId, async () => {
    try {
      return await tarefa();
    } finally {
      mudar(colecaoId, (e) => ({ ...e, concluidos: e.concluidos + 1 }));
    }
  }).finally(() => mudar(colecaoId, (e) => ({ ...e, emVoo: e.emVoo - 1 })));
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
