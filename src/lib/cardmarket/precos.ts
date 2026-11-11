/**
 * Orquestração da rodada de preços pela fonte Cardmarket
 * (`PRECO_FONTE=cardmarket`) — o que acontece quando o usuário aperta
 * "Atualizar preços (Cardmarket)". Server-only.
 *
 * O preço vem do campo `pricing` da ficha da carta na TCGdex
 * (`GET /v2/<idioma>/cards/<id>`), pelo **mesmo cliente do catálogo**
 * (`lib/sync/tcgdex.ts`): o mesmo limitador global, o mesmo User-Agent e o
 * mesmo bloqueio que aborta. Mesmo contrato da rodada da Liga
 * (`lib/liga/precos.ts`), que é de onde vêm as garantias:
 *
 * - **uma carta por vez, sequencial, nunca em paralelo** — a TCGdex já nos
 *   bloqueou uma vez por pressa (2026-08-25), e uma rodada de preços não
 *   tem pressa;
 * - **bloqueio aborta a rodada** (`ErroBloqueioUpstream`), sem retry, e fica
 *   gravado na rodada;
 * - 404 num idioma tenta o próximo (`idiomasDeConsulta`); 404 em todos é
 *   "não encontrada", gravada como resposta;
 * - outra falha de uma carta (depois das tentativas do cliente) é
 *   registrada e pulada; a rodada segue;
 * - grava por carta, e a rodada seguinte pula o que tem resposta de menos
 *   de 24 h, encontrada ou não — disparar de novo continua de onde parou.
 *   Não há fila, worker nem retomada automática com o container.
 *
 * A cotação (PTAX do euro) é buscada uma vez, pela rota, **antes** de a
 * rodada existir, e chega aqui pronta: a rodada inteira converte pela mesma
 * taxa, que fica gravada em cada linha.
 */

import type { Database } from "@/lib/db/client";
import {
  consultasCardmarketDesde,
  gravarPrecoCardmarket,
  type ResultadoConsultaCardmarket,
} from "@/lib/db/precos-cardmarket";
import {
  concluirRodadaDePreco,
  listarCartasEspeciaisPossuidas,
  registrarFotoDaRodada,
  tocarProgressoDePreco,
} from "@/lib/db/precos-liga";
import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import { JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS } from "@/lib/dominio/estimativa-varredura";
import {
  corteDeFrescor,
  separarPorFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "@/lib/dominio/frescor-consulta";
import { extrairPrecoCardmarket, idiomasDeConsulta } from "@/lib/dominio/preco-cardmarket";
import type { CartaParaPreco } from "@/lib/dominio/precos-cartas-especiais";
import {
  BACKOFF_MS,
  ErroItemUpstream,
  obterCarta,
  TAXA_POR_SEGUNDO,
  TENTATIVAS,
  type CardDetalhado,
  type Idioma,
  type OpcoesRequisicao,
} from "@/lib/sync/tcgdex";

/**
 * Teto de cada requisição da rodada. A TCGdex responde a ficha em fração de
 * segundo; vinte segundos só existem para uma conexão pendurada não segurar
 * a rodada para sempre. Estourar é transitório: o cliente repete.
 */
export const TIMEOUT_REQUISICAO_CARDMARKET_MS = 20_000;

/** Idiomas que uma carta tenta no pior caso: en, pt e jp. */
const IDIOMAS_NO_PIOR_CASO = 3;

/**
 * Quanto tempo sem batimento até uma rodada do Cardmarket ser dada como
 * morta. O batimento é tocado ao fim de cada carta, então a janela tem de
 * cobrir **o pior caso de uma carta** — senão uma rodada viva seria
 * declarada morta e liberaria uma segunda em paralelo, dobrando a pressão
 * sobre a TCGdex.
 *
 * O pior caso é cada idioma esgotar as tentativas do cliente, cada tentativa
 * estourar o timeout depois de esperar a vez no limitador, com o backoff
 * entre elas:
 *
 *     por idioma = TENTATIVAS × (timeout + 1/taxa) + backoff (300 ms + 600 ms)
 *                = 3 × (20 s + 1/6 s) + 0,9 s ≈ 61,4 s
 *     por carta  = 3 idiomas × 61,4 s ≈ 184 s
 *
 * Com a mesma folga de 1,5× de `janelaSemBatimentoSegundos`, ~276 s, e
 * nunca abaixo do piso de 120 s. Tudo derivado das constantes do cliente:
 * mexer em tentativas, backoff, taxa ou timeout move a janela junto.
 */
export const JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS = (() => {
  const backoffSegundos = (BACKOFF_MS * (TENTATIVAS * (TENTATIVAS - 1))) / 2 / 1000;
  const porIdioma =
    TENTATIVAS * (TIMEOUT_REQUISICAO_CARDMARKET_MS / 1000 + 1 / TAXA_POR_SEGUNDO) + backoffSegundos;
  return Math.max(
    JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS,
    Math.round(IDIOMAS_NO_PIOR_CASO * porIdioma * 1.5),
  );
})();

/**
 * Segundos por carta na estimativa da tela. Quase toda carta é uma
 * requisição só (a ficha en existe), respondida em fração de segundo, e o
 * limitador (6/s) não chega a pesar com uma carta por vez; meio segundo
 * cobre a requisição e as duas gravações no banco. É estimativa declarada
 * como estimativa: a rodada dura minutos, não horas, e a tela só precisa
 * da ordem de grandeza.
 */
export const SEGUNDOS_POR_CARTA_CARDMARKET = 0.5;

export function segundosDeRodadaCardmarket(cartas: number): number {
  return cartas <= 0 ? 0 : Math.ceil(cartas * SEGUNDOS_POR_CARTA_CARDMARKET);
}

/** Pede a ficha de uma carta num idioma. 404 sai como `ErroItemUpstream`. */
export type ObterFicha = (idioma: Idioma, cartaId: string) => Promise<Pick<CardDetalhado, "pricing">>;

/**
 * Consulta uma carta: pede a ficha nos idiomas que ela tem, na ordem de
 * `idiomasDeConsulta`, e lê o preço da primeira que existir. Só o 404 (e as
 * outras respostas permanentes do cliente) passa ao idioma seguinte: uma
 * ficha que respondeu sem preço do Cardmarket é resposta — a ficha pt da
 * mesma carta traz o mesmo produto, e perguntar de novo não mudaria nada.
 * Bloqueio e falha transitória esgotada sobem para a rodada decidir.
 */
export async function consultarCartaCardmarket(
  carta: Pick<CartaParaPreco, "cartaId" | "idiomas">,
  obter: ObterFicha,
): Promise<ResultadoConsultaCardmarket> {
  const idiomas = idiomasDeConsulta(carta.idiomas);
  // Sem idioma não houve pergunta, e gravar "não encontrada" seria mentir
  // sobre uma consulta que não aconteceu: falha da carta, não resposta.
  if (idiomas.length === 0) throw new Error(`carta sem ficha no catálogo: ${carta.cartaId}`);
  for (const idioma of idiomas) {
    let ficha: Pick<CardDetalhado, "pricing">;
    try {
      ficha = await obter(idioma, carta.cartaId);
    } catch (err) {
      if (err instanceof ErroItemUpstream) continue;
      throw err;
    }
    return { idiomaConsulta: idioma, preco: extrairPrecoCardmarket(ficha.pricing) };
  }
  return { idiomaConsulta: null, preco: null };
}

export interface ResumoRodadaCardmarket {
  cartasConsultadas: number;
  cartasComFalha: number;
  achadas: number;
  naoAchadas: number;
  requisicoes: number;
  erro?: string;
  falhas: Array<{ carta: string; motivo: string }>;
}

export interface DependenciasRodadaCardmarket {
  /** O cliente da TCGdex; trocado só em teste. */
  obterCarta?: (
    idioma: Idioma,
    cartaId: string,
    opcoes: OpcoesRequisicao,
  ) => Promise<Pick<CardDetalhado, "pricing">>;
}

/** Consulta cada carta e grava o preço, uma a uma. */
export async function executarRodadaCardmarket(
  db: Database,
  rodadaId: string,
  cartas: ReadonlyArray<Pick<CartaParaPreco, "cartaId" | "idiomas">>,
  cotacao: CotacaoPtax,
  { obterCarta: obter = obterCarta }: DependenciasRodadaCardmarket = {},
): Promise<ResumoRodadaCardmarket> {
  // Cada GET que sai conta, repetições do cliente incluídas.
  let requisicoes = 0;
  const opcoes: OpcoesRequisicao = {
    timeoutMs: TIMEOUT_REQUISICAO_CARDMARKET_MS,
    aoRequisitar: () => {
      requisicoes++;
    },
  };
  const obterFicha: ObterFicha = (idioma, cartaId) => obter(idioma, cartaId, opcoes);

  let cartasConsultadas = 0;
  let achadas = 0;
  let naoAchadas = 0;
  let erro: string | undefined;
  const falhas: Array<{ carta: string; motivo: string }> = [];

  // Sequencial de propósito: um `for` com `await`, nunca `Promise.all`.
  for (const carta of cartas) {
    try {
      const resultado = await consultarCartaCardmarket(carta, obterFicha);
      await gravarPrecoCardmarket(db, carta.cartaId, resultado, cotacao, rodadaId);
      if (resultado.preco) achadas++;
      else naoAchadas++;
      cartasConsultadas++;
    } catch (err) {
      if (err instanceof ErroBloqueioUpstream) {
        erro =
          `Acesso à TCGdex bloqueado (${err.motivo}). Rodada abortada de propósito: ` +
          `continuar tentando renova o bloqueio do IP.`;
        break;
      }
      const motivo = err instanceof Error ? err.message : String(err);
      falhas.push({ carta: carta.cartaId, motivo });
      console.error(`[preços cardmarket ${rodadaId}] falha em ${carta.cartaId}: ${motivo}`);
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
  // A foto do fim da rodada (também quando abortou por bloqueio), na série
  // da fonte Cardmarket. Uma falha aqui não pode derrubar o resumo de uma
  // rodada que já gravou tudo.
  await registrarFotoDaRodada(db, rodadaId, "cardmarket").catch((err) =>
    console.error(`[preços cardmarket ${rodadaId}] falha ao registrar a foto: ${String(err)}`),
  );
  return { cartasConsultadas, cartasComFalha: falhas.length, achadas, naoAchadas, requisicoes, erro, falhas };
}

/**
 * As cartas que uma rodada disparada agora consultaria, e as que pularia.
 * Mesma seleção da Liga (`listarCartasEspeciaisPossuidas`) e mesmo frescor
 * de 24 h, contado sobre `preco_carta_cardmarket`; sem teto de páginas,
 * "não encontrada" vale como resposta (`consultasCardmarketDesde`).
 */
export async function cartasParaConsultarCardmarket(
  db: Database,
  {
    validadeHoras = VALIDADE_CONSULTA_HORAS,
    agora = new Date(),
  }: { validadeHoras?: number; agora?: Date } = {},
): Promise<{ pendentes: CartaParaPreco[]; puladas: CartaParaPreco[]; total: number }> {
  const todas = await listarCartasEspeciaisPossuidas(db);
  if (validadeHoras <= 0) return { pendentes: todas, puladas: [], total: todas.length };
  const consultas = await consultasCardmarketDesde(db, corteDeFrescor({ agora, validadeHoras }));
  const { pendentes, puladas } = separarPorFrescor(todas, consultas, { agora, validadeHoras });
  return { pendentes, puladas, total: todas.length };
}
