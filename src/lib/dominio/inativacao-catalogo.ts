/**
 * Decide, ao final de uma rodada de sync (AGENTS.md, contrato do sync),
 * quais sets podem ter cartas antigas marcadas `ativa = false`.
 *
 * O sync usa o relógio (`atualizado_em < inicioDate`) para achar carta que
 * sumiu do upstream: toda linha upsertada nesta rodada ganha atualizado_em
 * fresco, então quem ficou para trás não foi vista agora. Isso só é verdade
 * para um set que a rodada de fato revisitou por completo. Um set que
 * falhou em `obterSet` (setsComFalha) ou teve alguma carta falhar em
 * `obterCarta` (cartasComErro) não foi totalmente revisto: sem excluí-lo,
 * o relógio inativaria cartas por engano, mentindo que sumiram do catálogo
 * quando só houve erro de rede transitório nesta rodada.
 *
 * Um set que sumiu de vez da listagem `/sets` (upstream removeu de fato) é
 * sinal legítimo de remoção — não passa por `setsComFalha` nem por
 * `cartasComErro` (nunca foi tentado), então não é excluído aqui: suas
 * cartas antigas são inativadas normalmente pelo relógio, como o contrato
 * pede.
 *
 * Rodada 100% vazia (ex.: API fora do ar já na listagem, ou todo set
 * falhando) nunca inativa nada — não é possível distinguir "sumiu do
 * upstream" de "não conseguimos checar", e apagar o catálogo por uma falha
 * de rede violaria "nunca apaga".
 *
 * **Sets pulados pelo sync incremental (2026-08-26).** Desde que a rodada
 * deixou de revisitar carta a carta os sets cujo conteúdo não mudou
 * (`decidirResyncSet`), essas cartas não passam mais pelo upsert. O sync
 * "toca" cada uma delas para manter o relógio coerente, mas isso não pode
 * ser a única linha de defesa: se o toque falhar, o relógio leria o
 * catálogo inteiro como sumido e inativaria tudo de uma vez. Por isso set
 * pulado é excluído do UPDATE aqui também — duas proteções independentes
 * para o mesmo acidente, que seria grave e silencioso.
 */

export interface ContextoInativacaoCatalogo {
  /** Quantidade de cartas efetivamente upsertadas nesta rodada. */
  totalCartasSincronizadas: number;
  /** Ids de set que falharam em `obterSet` nesta rodada. */
  setsComFalha: readonly string[];
  /** Cartas que falharam em `obterCarta`, com o set a que pertencem. */
  cartasComErro: readonly { setId: string }[];
  /**
   * Cartas revalidadas sem requisição de detalhe, nos sets que o incremental
   * pulou. Contam como "vistas nesta rodada": uma rodada em que todo set
   * estava inalterado enxergou o catálogo por completo, e não pode ser
   * confundida com a rodada vazia de uma API fora do ar.
   */
  totalCartasRevalidadas?: number;
  /** Ids de set pulados pelo incremental por estarem inalterados. */
  setsPulados?: readonly string[];
}

export interface DecisaoInativacaoCatalogo {
  /** Se falso, a rodada não deve rodar o UPDATE de inativação. */
  deveInativar: boolean;
  /** Set ids a excluir do UPDATE de inativação (falharam nesta rodada). */
  setsExcluidos: string[];
}

export function decidirInativacaoCatalogo(
  ctx: ContextoInativacaoCatalogo,
): DecisaoInativacaoCatalogo {
  const totalVistas =
    ctx.totalCartasSincronizadas + (ctx.totalCartasRevalidadas ?? 0);
  if (totalVistas === 0) {
    return { deveInativar: false, setsExcluidos: [] };
  }

  const setsExcluidos = new Set<string>(ctx.setsComFalha);
  for (const carta of ctx.cartasComErro) {
    setsExcluidos.add(carta.setId);
  }
  for (const setId of ctx.setsPulados ?? []) {
    setsExcluidos.add(setId);
  }

  return { deveInativar: true, setsExcluidos: [...setsExcluidos] };
}
