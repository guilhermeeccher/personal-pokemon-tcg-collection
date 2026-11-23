/**
 * O que a visão geral da v2 (`/inventario/visao-geral`) decide fora do
 * desenho: percentuais, a fatia de cada linha de distribuição, o link para o
 * inventário filtrado e o rótulo de preço de uma joia. Módulo puro; as
 * leituras são de `lib/db/resumo-inventario.ts` e `origem-preco-joias.ts`.
 */

import type { FontePreco } from "./fonte-preco";

/**
 * O percentual inteiro de uma divisão ou coleção, **sem arredondar para cima
 * até fechar**: 99,6% é 99, e só `preenchidas >= total` chega a 100. "100%"
 * com "faltam 1" na mesma linha seria mentira — a mesma regra de
 * `progressoDaColecao` (`lista-colecoes-v2.ts`), aqui para as divisões.
 */
export function percentualSemFechar(preenchidas: number, total: number): number {
  if (!(total > 0)) return 0;
  const p = Math.min(Math.max(preenchidas, 0), total);
  return p >= total ? 100 : Math.floor((p / total) * 100);
}

/** A fatia de uma linha de distribuição, de 0 a 1 (largura da barra e percentual escrito). */
export function fatiaDaDistribuicao(unidades: number, totalUnidades: number): number {
  if (!(totalUnidades > 0) || !(unidades > 0)) return 0;
  return Math.min(unidades / totalUnidades, 1);
}

/** Os recortes que a visão geral leva ao inventário: as chaves são as que a tela do inventário já lê. */
export type FiltroInventario = "set" | "raridade" | "idioma" | "condicao" | "variante" | "alocacao";

/**
 * `/inventario` com a **mesma querystring** que a tela de inventário lê
 * (nenhum sistema de filtro novo). Sem filtro, o inventário inteiro. O valor
 * sai codificado: um id de set ou uma raridade escrita com espaço e acento
 * continua um só valor.
 */
export function hrefInventario(filtro?: { chave: FiltroInventario; valor: string }): string {
  if (!filtro) return "/inventario";
  return `/inventario?${filtro.chave}=${encodeURIComponent(filtro.valor)}`;
}

/** O que a tela mostra do preço de uma carta da vitrine, na fonte ativa e só nela. */
export type PrecoDaJoia =
  | { fonte: "liga"; valor: number }
  | {
      fonte: "cardmarket";
      /** BRL: o valor guardado, já convertido pela PTAX na gravação. */
      valor: number;
      valorEur: number | null;
      /** A PTAX de fechamento (venda) que converteu a linha, e o dia dela. */
      cotacao: number | null;
      cotacaoData: string | null;
    };

export interface OrigemPrecoCardmarket {
  valorEur: number | null;
  cotacao: number | null;
  cotacaoData: string | null;
}

/**
 * A joia é a carta com o preço guardado na **fonte ativa** (`listarJoias`
 * escolhe a fonte e o valor). Sem valor, nada: "R$ 0" seria mentira. Na Liga o
 * valor segue em reais como o site dá, **sem conversão** e sem cotação; no
 * Cardmarket ele leva a fonte, o euro, a cotação e o dia dela. As duas fontes
 * nunca se misturam: com `liga`, uma linha do Cardmarket que sobrou no banco
 * não aparece.
 */
export function precoDaJoia(
  fonte: FontePreco,
  valor: number | null,
  origemCardmarket: OrigemPrecoCardmarket | undefined,
): PrecoDaJoia | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  if (fonte === "liga") return { fonte: "liga", valor };
  return {
    fonte: "cardmarket",
    valor,
    valorEur: origemCardmarket?.valorEur ?? null,
    cotacao: origemCardmarket?.cotacao ?? null,
    cotacaoData: origemCardmarket?.cotacaoData ?? null,
  };
}
