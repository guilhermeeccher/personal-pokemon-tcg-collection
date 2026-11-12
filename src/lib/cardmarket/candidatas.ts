/**
 * A busca de preços das candidatas de compra de uma coleção — o botão
 * "Buscar preços (Cardmarket)" da tela de opções de compra, quando
 * `PRECO_FONTE=cardmarket`. Server-only.
 *
 * É a rodada do inventário (`./precos.ts`) apontada para outro conjunto de
 * cartas: a mesma consulta por carta (`consultarCartaCardmarket`), o mesmo
 * cliente da TCGdex (limitador global, User-Agent, bloqueio que aborta), a
 * mesma PTAX buscada uma vez antes de a rodada existir, e as mesmas
 * garantias:
 *
 * - **uma carta por vez, sequencial**, e **uma rodada de candidatas por vez
 *   no app inteiro** (`rodadaDeCandidatasViva`). Uma rodada do inventário
 *   pode correr junto: as duas passam pelo mesmo limitador global do
 *   cliente, que é o teto por segundo do processo;
 * - bloqueio aborta a rodada, sem retry, gravado nela;
 * - falha de uma carta é registrada e pulada;
 * - grava por carta, e a rodada seguinte pula o que foi perguntado dentro
 *   da validade (`VALIDADE_PRECO_CANDIDATA_HORAS`, uma semana) — disparar de
 *   novo continua de onde parou. Sem fila, worker nem retomada automática.
 *
 * As cartas saem na ordem das vagas, para a tela ir se preenchendo de cima
 * para baixo enquanto a rodada anda.
 */

import { obterPtaxEuro } from "@/lib/cotacao/ptax";
import type { Database } from "@/lib/db/client";
import {
  concluirRodadaDeCandidatas,
  consultasDeCandidatasDesde,
  criarRodadaDeCandidatasSeLivre,
  encerrarRodadasDeCandidatasMortas,
  gravarPrecoCandidata,
  listarCandidatasDaColecao,
  rodadaDeCandidatasViva,
  tocarProgressoDeCandidatas,
  type RodadaPrecoCandidata,
} from "@/lib/db/candidatas-compra";
import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";
import { VALIDADE_PRECO_CANDIDATA_HORAS } from "@/lib/dominio/candidatas-compra";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import type { Idioma } from "@/lib/dominio/enums";
import { corteDeFrescor, separarPorFrescor } from "@/lib/dominio/frescor-consulta";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import { obterCarta, type OpcoesRequisicao } from "@/lib/sync/tcgdex";
import {
  consultarCartaCardmarket,
  JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS,
  TIMEOUT_REQUISICAO_CARDMARKET_MS,
  type DependenciasRodadaCardmarket,
  type ObterFicha,
} from "./precos";

/** Uma carta a perguntar: o id e os idiomas em que ela tem ficha. */
export interface CartaParaPrecoCandidata {
  /** Chave do frescor: o próprio `carta_id`, como no inventário. */
  chave: string;
  cartaId: string;
  idiomas: Idioma[];
}

/**
 * As cartas das candidatas da coleção, uma vez cada, na ordem das vagas, e
 * as que a validade pula.
 */
export async function cartasParaConsultarCandidatas(
  db: Database,
  colecao: { id: string; tipo: string; parametro: unknown },
  {
    validadeHoras = VALIDADE_PRECO_CANDIDATA_HORAS,
    agora = new Date(),
  }: { validadeHoras?: number; agora?: Date } = {},
): Promise<{
  pendentes: CartaParaPrecoCandidata[];
  puladas: CartaParaPrecoCandidata[];
  total: number;
}> {
  const vagas = await listarCandidatasDaColecao(db, colecao);
  const unicas = new Map<string, CartaParaPrecoCandidata>();
  for (const v of vagas) {
    for (const c of v.candidatas) {
      if (!unicas.has(c.cartaId)) {
        unicas.set(c.cartaId, { chave: c.cartaId, cartaId: c.cartaId, idiomas: c.idiomas });
      }
    }
  }
  const todas = [...unicas.values()];
  if (validadeHoras <= 0) return { pendentes: todas, puladas: [], total: todas.length };
  const consultas = await consultasDeCandidatasDesde(db, corteDeFrescor({ agora, validadeHoras }));
  const { pendentes, puladas } = separarPorFrescor(todas, consultas, { agora, validadeHoras });
  return { pendentes, puladas, total: todas.length };
}

export interface ResumoRodadaCandidatas {
  cartasConsultadas: number;
  cartasComFalha: number;
  achadas: number;
  requisicoes: number;
  erro?: string;
}

/** Pergunta cada carta e grava o preço, uma a uma. */
export async function executarRodadaCandidatas(
  db: Database,
  rodadaId: string,
  cartas: ReadonlyArray<CartaParaPrecoCandidata>,
  cotacao: CotacaoPtax,
  { obterCarta: obter = obterCarta }: DependenciasRodadaCardmarket = {},
): Promise<ResumoRodadaCandidatas> {
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
  let erro: string | undefined;
  const falhas: Array<{ carta: string; motivo: string }> = [];

  // Sequencial de propósito: um `for` com `await`, nunca `Promise.all`.
  for (const carta of cartas) {
    try {
      const resultado = await consultarCartaCardmarket(carta, obterFicha);
      await gravarPrecoCandidata(db, carta.cartaId, resultado, cotacao);
      if (resultado.preco) achadas++;
      cartasConsultadas++;
    } catch (err) {
      if (err instanceof ErroBloqueioUpstream) {
        erro =
          `Acesso à TCGdex bloqueado (${err.motivo}). Busca abortada de propósito: ` +
          `continuar tentando renova o bloqueio do IP.`;
        break;
      }
      const motivo = err instanceof Error ? err.message : String(err);
      falhas.push({ carta: carta.cartaId, motivo });
      console.error(`[preços candidatas ${rodadaId}] falha em ${carta.cartaId}: ${motivo}`);
    }
    // Batimento por carta: progresso na tela e prova de que a rodada vive.
    await tocarProgressoDeCandidatas(db, rodadaId, {
      cartasConsultadas,
      cartasComFalha: falhas.length,
      requisicoes,
    });
  }

  const resumoFalhas =
    falhas.length === 0
      ? undefined
      : `${falhas.length} carta(s) falharam. Primeira: ${falhas[0].carta} — ${falhas[0].motivo}`;
  const erroFinal = erro ?? resumoFalhas;
  await concluirRodadaDeCandidatas(db, rodadaId, {
    cartasConsultadas,
    cartasComFalha: falhas.length,
    requisicoes,
    erro: erroFinal,
  });
  return { cartasConsultadas, cartasComFalha: falhas.length, achadas, requisicoes, erro: erroFinal };
}

export type InicioRodadaCandidatas =
  | {
      iniciada: true;
      rodadaId: string;
      pendentes: CartaParaPrecoCandidata[];
      puladas: CartaParaPrecoCandidata[];
      cotacao: CotacaoPtax;
    }
  | {
      iniciada: false;
      status: 400 | 409 | 503;
      recusa: Recusa;
      /** Só em `precosEmAndamento`: a rodada viva, que pode ser de outra coleção. */
      viva?: RodadaPrecoCandidata;
      cartasPuladas?: number;
    };

function recusaNadaAConsultar(
  { puladas, total }: { puladas: readonly unknown[]; total: number },
  validadeHoras: number,
): InicioRodadaCandidatas {
  return {
    iniciada: false,
    status: 400,
    recusa:
      total === 0
        ? recusa("semCandidatasParaPreco")
        : recusa("precosCandidatasJaConsultados", {
            total: String(puladas.length),
            dias: String(Math.round(validadeHoras / 24)),
          }),
    cartasPuladas: puladas.length,
  };
}

/**
 * Tudo o que acontece antes de a rodada começar a perguntar. Mesma ordem de
 * recusas da rodada do inventário (`iniciarRodadaCardmarket`): rodada viva
 * (409), nada a consultar (400), cotação indisponível (503) — sem a PTAX a
 * rodada não começa, em vez de gravar preço sem conversão. A lista é refeita
 * depois da cotação pelo mesmo motivo de lá: outra rodada pode ter consultado
 * as mesmas cartas nesse meio.
 */
export async function iniciarRodadaCandidatas(
  db: Database,
  colecao: { id: string; tipo: string; parametro: unknown },
  { validadeHoras = VALIDADE_PRECO_CANDIDATA_HORAS }: { validadeHoras?: number } = {},
): Promise<InicioRodadaCandidatas> {
  const janela = JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS;
  await encerrarRodadasDeCandidatasMortas(db, janela);
  const viva = await rodadaDeCandidatasViva(db, janela);
  if (viva) return { iniciada: false, status: 409, recusa: recusa("precosEmAndamento"), viva };

  const antes = await cartasParaConsultarCandidatas(db, colecao, { validadeHoras });
  if (antes.pendentes.length === 0) return recusaNadaAConsultar(antes, validadeHoras);

  let cotacao: CotacaoPtax;
  try {
    cotacao = await obterPtaxEuro();
  } catch (err) {
    console.error(`[preços candidatas] ${err instanceof Error ? err.message : String(err)}`);
    return { iniciada: false, status: 503, recusa: recusa("cotacaoIndisponivel") };
  }

  const depois = await cartasParaConsultarCandidatas(db, colecao, { validadeHoras });
  if (depois.pendentes.length === 0) return recusaNadaAConsultar(depois, validadeHoras);

  const criacao = await criarRodadaDeCandidatasSeLivre(
    db,
    colecao.id,
    depois.pendentes.length,
    janela,
  );
  if ("viva" in criacao) {
    return { iniciada: false, status: 409, recusa: recusa("precosEmAndamento"), viva: criacao.viva };
  }
  return {
    iniciada: true,
    rodadaId: criacao.criada,
    pendentes: depois.pendentes,
    puladas: depois.puladas,
    cotacao,
  };
}
