/**
 * O detalhe de uma carta — a leitura da v2 (`GET /api/cartas/:cartaId/detalhe`)
 * que a camada de detalhe abre a partir da grade, do inventário ou do "o que
 * falta". Módulo puro: escolhe a ficha de exibição, decide qual preço mostrar
 * e monta a série curta.
 *
 * ## A carta é o `carta_id`, não a ficha
 *
 * As fichas pt e en de um `carta_id` são a mesma carta física (regra 7 levada
 * um passo adiante, como na coleção de set). O detalhe junta **todas as
 * cópias do usuário daquela carta**, de qualquer ficha e de qualquer idioma
 * físico, e mostra a ficha pedida (a da vaga ou da cópia que abriu o
 * detalhe) ou, sem pedido, pt, senão en, senão jp — a mesma ordem da tela de
 * Preços.
 *
 * ## Qual preço, e quando não há
 *
 * Um preço só, **na fonte da instalação**, nunca as duas somadas:
 *
 * - **Carta possuída e especial:** a tabela de preços do inventário da fonte
 *   ativa (`preco_carta_cardmarket` ou `preco_carta_liga`) — o mesmo número da
 *   tela de Preços e das joias.
 * - **Carta possuída comum ou incomum:** nunca tem preço (as rodadas não a
 *   consultam, `precos-cartas-especiais.ts`). O motivo vai junto, para a tela
 *   dizer "sem preço de referência" em vez de um vazio sem explicação.
 * - **Carta que não está no inventário:** na fonte Cardmarket, o preço de
 *   candidata de compra, quando uma busca de preços de coleção já a
 *   perguntou; na Liga, nada (as opções de varredura são por vaga, e o
 *   detalhe aberto de uma vaga as tem pelo "o que falta").
 *
 * ## A série curta
 *
 * Só existe para carta possuída e especial: é das tabelas de histórico do
 * inventário, só de inserção. Candidata não tem histórico, por decisão
 * registrada ("No history: nothing plots it"), e a série não é inventada para
 * ela. Uma fonte só, a ativa — juntar as duas desenharia uma queda que nunca
 * aconteceu. Só as consultas que acharam preço viram ponto; a série pode ter
 * poucos pontos, porque a frequência é a das rodadas.
 */

import type { Idioma } from "./enums";
import type { PrecoReferencia } from "./falta-colecao";
import type { FontePreco } from "./fonte-preco";
import { ehCartaEspecial } from "./precos-cartas-especiais";
import { raridadeCanonica } from "./tema-colecao";
import type { CriterioValorCardmarket } from "./preco-cardmarket";

/** Quantos pontos a série curta leva, no máximo: os mais recentes. */
export const PONTOS_SERIE_CURTA = 30;

const ORDEM_EXIBICAO: readonly Idioma[] = ["pt", "en", "jp"];

/**
 * A ficha que o detalhe mostra: a pedida, quando a carta a tem; senão pt,
 * senão en, senão jp. Devolve `undefined` sem ficha nenhuma.
 */
export function escolherFichaDoDetalhe<T extends { idioma: Idioma }>(
  fichas: readonly T[],
  pedida: Idioma | null,
): T | undefined {
  if (pedida !== null) {
    const exata = fichas.find((f) => f.idioma === pedida);
    if (exata) return exata;
  }
  for (const idioma of ORDEM_EXIBICAO) {
    const f = fichas.find((x) => x.idioma === idioma);
    if (f) return f;
  }
  return undefined;
}

/**
 * A raridade canônica da ficha mostrada, para a tela rotular: a regra das
 * sugestões de coleção (`raridadeCanonica`, seção "Collection suggestions"
 * do AGENTS.md) — a raridade da linha **en** do mesmo `carta_id`, senão a
 * gravada. As fichas pt e en de uma carta escrevem a raridade em dois
 * idiomas ("Rara Dupla", "Double rare"), e o rótulo (`raridadesCarta`) é
 * chaveado pela grafia en: sem isto, uma ficha pt com a interface em inglês
 * mostraria a raridade em português.
 *
 * Só para ficha ocidental: a japonesa tem `set_id` próprio, e os quatro sets
 * que dividem o id com o inglês (`neo1` a `neo4`) são outras cartas — a linha
 * en não diz nada sobre ela, e a ficha jp fica com a raridade gravada.
 */
export function raridadeCanonicaDaFicha<T extends { idioma: Idioma; raridade: string | null }>(
  ficha: T,
  fichas: readonly T[],
): string | null {
  if (ficha.idioma === "jp") return ficha.raridade;
  const en = fichas.find((f) => f.idioma === "en");
  return raridadeCanonica({ raridade: ficha.raridade, raridadeEn: en?.raridade ?? null });
}

/**
 * A carta entra nas rodadas de preço do inventário? A mesma regra da
 * seleção (`selecionarCartasParaPreco`): uma ficha explicitamente comum ou
 * incomum tira a carta, mesmo que a outra não traga raridade.
 */
export function cartaTemPrecoDeInventario(
  fichas: ReadonlyArray<{ setId: string; raridade: string | null }>,
): boolean {
  return fichas.length > 0 && fichas.every(ehCartaEspecial);
}

/** Uma linha de `preco_carta_cardmarket` ou de `preco_candidata_cardmarket`. */
export interface LinhaPrecoCardmarket {
  encontrada: boolean;
  valor: number | null;
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  tendenciaEur: number | null;
  cotacao: number | null;
  cotacaoData: string | null;
  /** Quando o preço guardado foi lido. */
  em: Date | null;
}

/** Uma linha de `preco_carta_liga`. */
export interface LinhaPrecoLiga {
  encontrada: boolean;
  minimo: number | null;
  medio: number | null;
  maximo: number | null;
  em: Date;
}

export type MotivoSemPreco =
  /** Comum ou incomum: as rodadas de preço não a consultam. */
  | "naoEspecial"
  /** Especial e possuída, mas nenhuma rodada da fonte ativa a consultou ainda. */
  | "naoConsultada"
  /** Consultada, e a fonte não tinha preço. */
  | "semPrecoNaFonte"
  /** Não está no inventário, e a fonte ativa não tem preço de candidata para ela. */
  | "foraDoInventario";

export interface PrecoDoDetalhe {
  fonte: FontePreco;
  /** De onde o número saiu: o inventário (cópia possuída) ou a busca de candidatas de compra. */
  origem: "inventario" | "candidata" | null;
  preco: PrecoReferencia | null;
  motivo?: MotivoSemPreco;
}

function referenciaCardmarket(l: LinhaPrecoCardmarket): PrecoReferencia | null {
  if (!l.encontrada || l.valor === null) return null;
  return {
    fonte: "cardmarket",
    valor: l.valor,
    em: l.em === null ? null : l.em.toISOString(),
    cardmarket: {
      valorEur: l.valorEur,
      criterioValor: l.criterioValor,
      ...(l.criterioValor === "media30" ? { tendenciaEur: l.tendenciaEur } : {}),
      cotacao: l.cotacao,
      cotacaoData: l.cotacaoData,
    },
  };
}

/** O preço que o detalhe mostra, ou o motivo de não haver. Ver o cabeçalho. */
export function precoDoDetalhe(e: {
  fonte: FontePreco;
  possuida: boolean;
  especial: boolean;
  inventarioCardmarket: LinhaPrecoCardmarket | null;
  inventarioLiga: LinhaPrecoLiga | null;
  candidataCardmarket: LinhaPrecoCardmarket | null;
}): PrecoDoDetalhe {
  if (e.possuida) {
    if (!e.especial) return { fonte: e.fonte, origem: null, preco: null, motivo: "naoEspecial" };
    if (e.fonte === "cardmarket") {
      const l = e.inventarioCardmarket;
      if (l === null) return { fonte: e.fonte, origem: null, preco: null, motivo: "naoConsultada" };
      const preco = referenciaCardmarket(l);
      return preco
        ? { fonte: e.fonte, origem: "inventario", preco }
        : { fonte: e.fonte, origem: null, preco: null, motivo: "semPrecoNaFonte" };
    }
    const l = e.inventarioLiga;
    if (l === null) return { fonte: e.fonte, origem: null, preco: null, motivo: "naoConsultada" };
    const valor = l.medio ?? l.minimo;
    if (!l.encontrada || valor === null) {
      return { fonte: e.fonte, origem: null, preco: null, motivo: "semPrecoNaFonte" };
    }
    return {
      fonte: e.fonte,
      origem: "inventario",
      preco: {
        fonte: "liga",
        valor,
        em: l.em.toISOString(),
        liga: { minimo: l.minimo, medio: l.medio, maximo: l.maximo },
      },
    };
  }

  if (e.fonte === "cardmarket" && e.candidataCardmarket !== null) {
    const preco = referenciaCardmarket(e.candidataCardmarket);
    return preco
      ? { fonte: e.fonte, origem: "candidata", preco }
      : { fonte: e.fonte, origem: null, preco: null, motivo: "semPrecoNaFonte" };
  }
  return { fonte: e.fonte, origem: null, preco: null, motivo: "foraDoInventario" };
}

/** Uma linha de histórico, de uma das duas fontes, já com o valor da régua dela. */
export interface PontoBruto {
  em: Date;
  encontrada: boolean;
  /** Cardmarket: `valor`; Liga: médio, senão menor. */
  valor: number | null;
}

export interface SerieCurta {
  fonte: FontePreco;
  pontos: { em: string; valor: number }[];
}

/**
 * A série curta: os `PONTOS_SERIE_CURTA` pontos mais recentes com preço, do
 * mais antigo para o mais novo. `null` quando a carta não tem histórico na
 * régua (não possuída, ou comum/incomum) — ver o cabeçalho.
 */
export function serieCurta(
  fonte: FontePreco,
  temHistorico: boolean,
  linhas: readonly PontoBruto[],
): SerieCurta | null {
  if (!temHistorico) return null;
  const pontos = linhas
    .flatMap((l) => (l.encontrada && l.valor !== null ? [{ em: l.em, valor: l.valor }] : []))
    .sort((a, b) => a.em.getTime() - b.em.getTime())
    .slice(-PONTOS_SERIE_CURTA)
    .map((p) => ({ em: p.em.toISOString(), valor: p.valor }));
  return { fonte, pontos };
}
