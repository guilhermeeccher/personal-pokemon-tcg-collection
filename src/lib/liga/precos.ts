/**
 * Orquestração da consulta de preço das cartas especiais — o que acontece
 * quando o usuário aperta "Atualizar preços das cartas especiais".
 *
 * Server-only. Mesmo contrato da varredura de opções de compra
 * (`./varredura.ts`), que é de onde vêm as regras duras:
 *
 * - o ritmo é o do cliente (`./cliente.ts`: `robots.txt`, ou
 *   `LIGA_INTERVALO_SEGUNDOS` de quem instalou) — nada aqui o acelera;
 * - **bloqueio aborta a rodada**, sem retry, e fica gravado na rodada;
 * - falha de uma carta só (5xx, timeout) é registrada e pulada;
 * - grava por carta, e a rodada seguinte pula o que já tem resposta dentro
 *   de 24 h (`separarCartasPorFrescor`) — disparar de novo continua de onde
 *   parou. Não há fila, worker nem retomada automática com o container.
 *
 * ## O teto de páginas — e por que é maior que o da vaga de set
 *
 * A busca é por nome, **do mais barato para o mais caro**, e a carta que
 * mais interessa aqui é justamente a cara. Uma carta valiosa com nome comum
 * (Charizard tem centenas de impressões) pode estar além da terceira página,
 * e "não achei na página 3" é indistinguível de "não existe". Por isso
 * `MAX_PAGINAS_PRECO`: mais requisições por carta, **no mesmo ritmo** — o
 * limitador é por requisição, então o teto maior custa tempo, nunca pressão
 * por segundo sobre o site deles. A medição que o fixou está no comentário
 * da constante.
 */

import type { Database } from "@/lib/db/client";
import { vinculosDosSets } from "@/lib/db/liga";
import {
  concluirRodadaDePreco,
  consultasDePrecoDesde,
  gravarPrecoDeCarta,
  listarCartasEspeciaisPossuidas,
  tocarProgressoDePreco,
} from "@/lib/db/precos-liga";
import {
  corteDeFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "@/lib/dominio/frescor-consulta";
import type { LinhaBuscaLiga } from "@/lib/dominio/liga-busca";
import {
  escolherLinhaDePreco,
  separarCartasPorFrescor,
  type CartaParaPreco,
} from "@/lib/dominio/precos-cartas-especiais";
import { criarClienteLiga, ErroBloqueioLiga, type ClienteLiga } from "./cliente";

/**
 * Páginas por busca na consulta de preço (40 linhas cada, mais barata
 * primeiro).
 *
 * **Medido em 2026-10-05**, na primeira rodada real (ritmo de 7 s): com o
 * teto de 3 páginas (o da vaga de set), uma carta clássica de nome muito comum
 * e preço alto ficou sem lugar nas 120 linhas mais baratas do nome. Com o
 * teto maior ela apareceu na 6ª página (6 requisições). O teto ficou em 20,
 * uma folga de ~3x sobre o caso medido, para a carta cara de nome comum
 * aparecer. O custo é só tempo: a carta achada para de paginar na página em
 * que aparece, e o limitador é por
 * requisição.
 */
export const MAX_PAGINAS_PRECO = 20;

/** Buscas por carta no pior caso: o nome em inglês e o alternativo. */
export const BUSCAS_POR_CARTA_NO_PIOR_CASO = 2;

/** Requisições de uma carta no pior caso — base da janela de "rodada morta". */
export const REQUISICOES_NO_PIOR_CASO_POR_CARTA =
  BUSCAS_POR_CARTA_NO_PIOR_CASO * MAX_PAGINAS_PRECO;

export interface ResumoRodadaPreco {
  cartasConsultadas: number;
  cartasComFalha: number;
  achadas: number;
  naoAchadas: number;
  requisicoes: number;
  erro?: string;
  falhas: Array<{ carta: string; motivo: string }>;
}

async function consultarCarta(
  cliente: ClienteLiga,
  carta: CartaParaPreco,
  setPorEdid: ReadonlyMap<number, string>,
  maxPaginas: number,
): Promise<{ linha: LinhaBuscaLiga | null; requisicoes: number }> {
  const achou = (linhas: readonly LinhaBuscaLiga[]) =>
    escolherLinhaDePreco(linhas, carta, setPorEdid) !== null;

  let requisicoes = 0;
  for (const nome of [carta.nomeBusca, carta.nomeAlternativo]) {
    if (nome === null) continue;
    const resultado = await cliente.buscarCarta(nome, achou, maxPaginas);
    requisicoes += resultado.requisicoes;
    const linha = escolherLinhaDePreco(resultado.linhas, carta, setPorEdid);
    if (linha) return { linha, requisicoes };
  }
  return { linha: null, requisicoes };
}

/** Consulta cada carta e grava o preço, uma a uma. */
export async function executarRodadaDePrecos(
  db: Database,
  rodadaId: string,
  cartas: ReadonlyArray<CartaParaPreco>,
  cliente: ClienteLiga = criarClienteLiga(),
  maxPaginas: number = MAX_PAGINAS_PRECO,
): Promise<ResumoRodadaPreco> {
  let requisicoes = 0;
  let cartasConsultadas = 0;
  let achadas = 0;
  let naoAchadas = 0;
  let erro: string | undefined;
  const falhas: Array<{ carta: string; motivo: string }> = [];

  const setPorEdid = await vinculosDosSets(db, [...new Set(cartas.map((c) => c.setId))]);

  for (const carta of cartas) {
    try {
      const { linha, requisicoes: gastas } = await consultarCarta(
        cliente,
        carta,
        setPorEdid,
        maxPaginas,
      );
      requisicoes += gastas;
      await gravarPrecoDeCarta(db, carta.cartaId, linha, maxPaginas);
      if (linha) achadas++;
      else naoAchadas++;
      cartasConsultadas++;
    } catch (err) {
      if (err instanceof ErroBloqueioLiga) {
        erro = err.message;
        break;
      }
      const motivo = err instanceof Error ? err.message : String(err);
      falhas.push({ carta: carta.cartaId, motivo });
      console.error(`[preços ${rodadaId}] falha em ${carta.cartaId}: ${motivo}`);
    }
    // Batimento por carta: progresso na tela e prova de que a rodada vive.
    await tocarProgressoDePreco(db, rodadaId, {
      cartasConsultadas,
      cartasComFalha: falhas.length,
      requisicoes,
    });
  }

  const resumoFalhas =
    falhas.length === 0
      ? undefined
      : `${falhas.length} carta(s) falharam. Primeira: ${falhas[0].carta} — ${falhas[0].motivo}`;

  await concluirRodadaDePreco(db, rodadaId, {
    cartasConsultadas,
    cartasComFalha: falhas.length,
    requisicoes,
    erro: erro ?? resumoFalhas,
  });
  return { cartasConsultadas, cartasComFalha: falhas.length, achadas, naoAchadas, requisicoes, erro, falhas };
}

/** As cartas que uma rodada disparada agora consultaria, e as que pularia. */
export async function cartasParaConsultar(
  db: Database,
  {
    validadeHoras = VALIDADE_CONSULTA_HORAS,
    maxPaginas = MAX_PAGINAS_PRECO,
    agora = new Date(),
  }: { validadeHoras?: number; maxPaginas?: number; agora?: Date } = {},
): Promise<{ pendentes: CartaParaPreco[]; puladas: CartaParaPreco[]; total: number }> {
  const todas = await listarCartasEspeciaisPossuidas(db);
  if (validadeHoras <= 0) return { pendentes: todas, puladas: [], total: todas.length };
  const consultas = await consultasDePrecoDesde(db, corteDeFrescor({ agora, validadeHoras }));
  const { pendentes, puladas } = separarCartasPorFrescor(todas, consultas, {
    agora,
    validadeHoras,
    maxPaginas,
  });
  return { pendentes, puladas, total: todas.length };
}
