/**
 * Orquestração da rodada de preços pela fonte Cardmarket
 * (`PRECO_FONTE=cardmarket`) — o que acontece quando o usuário aperta
 * "Atualizar preços (Cardmarket)", ou quando o comando
 * `pnpm precos:cardmarket` roda. Server-only.
 *
 * Os dois entram pela mesma porta, `iniciarRodadaCardmarket`, com as mesmas
 * recusas e a mesma trava por fonte: o botão dispara a rodada e responde na
 * hora; o comando espera ela terminar. Uma rodada do comando aparece na tela
 * como qualquer outra, e nunca roda junto com uma do botão.
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
 *   Não há fila, worker nem retomada automática com o container. Agendar a
 *   atualização é permitido só para esta fonte, e **de fora do app**: um
 *   agendador do host chama o comando dentro do container (AGENTS.md). Na
 *   Liga, com o `Crawl-delay` de minutos e rodadas de horas, continua
 *   proibido.
 *
 * A cotação (PTAX do euro) é buscada uma vez, em `iniciarRodadaCardmarket`,
 * **antes** de a rodada existir, e chega à rodada pronta: a rodada inteira
 * converte pela mesma taxa, que fica gravada em cada linha.
 */

import { obterPtaxEuro } from "@/lib/cotacao/ptax";
import type { Database } from "@/lib/db/client";
import {
  consultasCardmarketDesde,
  gravarPrecoCardmarket,
  type ResultadoConsultaCardmarket,
} from "@/lib/db/precos-cardmarket";
import {
  concluirRodadaDePreco,
  criarRodadaDePrecoSeLivre,
  encerrarRodadasDePrecoMortas,
  listarCartasEspeciaisPossuidas,
  registrarFotoDaRodada,
  rodadaDePrecoViva,
  tocarProgressoDePreco,
} from "@/lib/db/precos-liga";
import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
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

/** A rodada criada, pronta para `executarRodadaCardmarket`. */
export interface RodadaCardmarketIniciada {
  iniciada: true;
  rodadaId: string;
  pendentes: CartaParaPreco[];
  puladas: CartaParaPreco[];
  /** A PTAX que a rodada inteira usa para converter. */
  cotacao: CotacaoPtax;
}

/**
 * Um disparo recusado: a chave (com os valores) que a tela traduz, o status
 * HTTP que a rota responde e o que acompanha cada recusa no corpo de sempre.
 */
export interface RodadaCardmarketRecusada {
  iniciada: false;
  status: 400 | 409 | 503;
  recusa: Recusa;
  /** Só em `precosEmAndamento`: a rodada que já está viva. */
  rodadaId?: string;
  /** Só em `semCartasEspeciais` e `precosJaConsultados`: as cartas que o frescor pulou. */
  cartasPuladas?: number;
  /**
   * Só em `cotacaoIndisponivel`: o motivo técnico. Vai para o log e para o
   * comando; a tela mostra só a chave.
   */
  detalhe?: string;
}

export type InicioRodadaCardmarket = RodadaCardmarketIniciada | RodadaCardmarketRecusada;

function recusaEmAndamento(rodadaId: string): RodadaCardmarketRecusada {
  // Duas rodadas ao mesmo tempo dobrariam a pressão sobre a TCGdex.
  return { iniciada: false, status: 409, recusa: recusa("precosEmAndamento"), rodadaId };
}

/** A recusa de um disparo sem nada a consultar: sem carta especial, ou tudo fresco. */
function recusaNadaAConsultar(
  { puladas, total }: { puladas: readonly unknown[]; total: number },
  validadeHoras: number,
): RodadaCardmarketRecusada {
  return {
    iniciada: false,
    status: 400,
    recusa:
      total === 0
        ? recusa("semCartasEspeciais")
        : recusa("precosJaConsultados", {
            total: String(puladas.length),
            horas: String(validadeHoras),
          }),
    cartasPuladas: puladas.length,
  };
}

/**
 * Tudo o que acontece antes de a rodada começar a consultar — a mesma porta
 * para o botão e para o comando, para as recusas e a trava serem as mesmas.
 * Mesma ordem de recusas da Liga — rodada viva (409), nada a consultar
 * (400) —, mais a cotação: sem a PTAX do euro a rodada não começa (503
 * `cotacaoIndisponivel`), em vez de gravar preço sem conversão ou convertido
 * por uma taxa inventada. A cotação é buscada uma vez, antes de a rodada
 * existir, e a rodada inteira converte por ela.
 *
 * Devolve a rodada criada, sem começar a consultar: quem chama decide se
 * espera (`executarRodadaCardmarket` com `await`, o comando) ou não (a rota,
 * que responde na hora).
 */
export async function iniciarRodadaCardmarket(
  db: Database,
  { validadeHoras = VALIDADE_CONSULTA_HORAS }: { validadeHoras?: number } = {},
): Promise<InicioRodadaCardmarket> {
  const janela = JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS;
  await encerrarRodadasDePrecoMortas(db, janela, "cardmarket");
  const emAndamento = await rodadaDePrecoViva(db, janela, "cardmarket");
  if (emAndamento) return recusaEmAndamento(emAndamento.id);

  const antes = await cartasParaConsultarCardmarket(db, { validadeHoras });
  if (antes.pendentes.length === 0) return recusaNadaAConsultar(antes, validadeHoras);

  let cotacao: CotacaoPtax;
  try {
    cotacao = await obterPtaxEuro();
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    // A tela mostra a recusa pela chave; o motivo técnico fica no log.
    console.error(`[preços cardmarket] ${detalhe}`);
    return { iniciada: false, status: 503, recusa: recusa("cotacaoIndisponivel"), detalhe };
  }

  // A busca da cotação pode levar segundos (até duas tentativas com teto de
  // 20 s), e um segundo disparo nesse meio passaria pelas checagens lá de
  // cima. Outra rodada pode ter começado — ou até terminado, consultando as
  // mesmas cartas. Por isso a lista é refeita depois da cotação (a primeira
  // só evita buscar a PTAX num disparo que não tem o que fazer), e a checagem
  // final e a criação vão juntas, serializadas por fonte
  // (`criarRodadaDePrecoSeLivre`): rodada viva dá 409, e o que outra já
  // consultou sai da lista. Sobra a janela entre refazer a lista e pegar a
  // trava — normalmente milissegundos, mas sem garantia (espera pelo banco,
  // pausa do processo). Se outra rodada começar e terminar inteira nela, as
  // cartas dela são consultadas de novo: requisições a mais, nunca dado
  // errado (o upsert grava o mesmo preço e o histórico só acrescenta).
  const depois = await cartasParaConsultarCardmarket(db, { validadeHoras });
  if (depois.pendentes.length === 0) return recusaNadaAConsultar(depois, validadeHoras);
  const { pendentes, puladas } = depois;

  const criacao = await criarRodadaDePrecoSeLivre(db, pendentes.length, janela, "cardmarket");
  if ("viva" in criacao) return recusaEmAndamento(criacao.viva);
  return { iniciada: true, rodadaId: criacao.criada, pendentes, puladas, cotacao };
}
