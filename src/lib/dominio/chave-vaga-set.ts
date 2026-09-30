/**
 * Chave de vaga numa coleção de set: `<set_id>/<local_id>` (2026-09-30).
 *
 * Até esta data a chave era só o `local_id` ("001"), e o set vinha do
 * parâmetro da coleção — um set por coleção. Duas mudanças pedidas pelo
 * usuário quebraram isso: juntar sets numa coleção só (o 30th Celebration
 * vem separado da sua Coleção Clássica, `30th-c`, e os dois têm uma carta
 * "001") e incluir carta avulsa de qualquer set numa coleção já criada. A
 * vaga passou a saber de que set é a carta que ela espera.
 *
 * **Por que na chave, e não numa coluna `set_id` na vaga.** `liga_opcao` e
 * `escolha_compra` identificam a vaga por `(coleção, chave)` em texto, e a
 * unicidade da vaga também (`vaga_colecao_chave_unique`). Qualificando a
 * chave, as três continuam únicas e corretas sem mudar de schema; com uma
 * coluna à parte, cada uma precisaria dela também, e cada consulta que as
 * junta teria de lembrar de casar os dois campos. O custo fica todo aqui:
 * quem precisa do número impresso (rótulo na tela, busca na Liga, ordem)
 * passa por `lerChaveVagaSet` — e só código de coleção de SET faz isso. A
 * chave de Pokédex continua o número nacional, e a de customizada o
 * sequencial.
 *
 * `/` não aparece em nenhum `set_id` nem em nenhum `local_id` do catálogo
 * (conferido nas 48.336 linhas em 2026-09-30), então a leitura é inequívoca.
 *
 * Módulo puro, sem I/O.
 */

import { compararLocalId } from "./ordenacao";

const SEPARADOR = "/";

export function chaveVagaSet(setId: string, localId: string): string {
  return `${setId}${SEPARADOR}${localId}`;
}

/** `null` quando a chave não é de vaga de set (Pokédex, customizada). */
export function lerChaveVagaSet(
  chave: string,
): { setId: string; localId: string } | null {
  const i = chave.indexOf(SEPARADOR);
  if (i <= 0 || i === chave.length - 1) return null;
  return { setId: chave.slice(0, i), localId: chave.slice(i + 1) };
}

/**
 * O que a tela mostra como "número" da vaga: o `local_id` numa vaga de
 * set, a própria chave nas outras. O set, quando importa, vai à parte.
 */
export function rotuloChaveVaga(chave: string): string {
  return lerChaveVagaSet(chave)?.localId ?? chave;
}

/**
 * Comparador de chaves de vaga: set na ordem dada (a da receita da
 * coleção; um set fora dela vai depois, em ordem alfabética) e, dentro do
 * set, a ordem impressa (`compararLocalId`). Chave que não é de set cai na
 * ordem natural de sempre.
 */
export function compararChavesVaga(
  ordemSets: readonly string[] = [],
): (a: string, b: string) => number {
  const posicao = (setId: string) => {
    const i = ordemSets.indexOf(setId);
    return i === -1 ? ordemSets.length : i;
  };
  return (a, b) => {
    const pa = lerChaveVagaSet(a);
    const pb = lerChaveVagaSet(b);
    if (!pa || !pb) return compararLocalId(a, b);
    if (pa.setId !== pb.setId) {
      const diferenca = posicao(pa.setId) - posicao(pb.setId);
      return diferenca !== 0 ? diferenca : pa.setId.localeCompare(pb.setId);
    }
    return compararLocalId(pa.localId, pb.localId);
  };
}
