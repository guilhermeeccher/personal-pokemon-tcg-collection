/**
 * Chave sequencial de vaga para coleção customizada (spec §3.3): "a vaga
 * nasce ao alocar, com chave sequencial" — customizada não tem universo
 * fixo, então não há vaga vazia pré-criada; cada adição de cópia cria a
 * própria vaga com a próxima chave livre.
 *
 * Buraco na numeração (por remoção) NUNCA é preenchido — decisão do
 * coordenador: renumerar seria trabalho e risco à toa para uma coleção
 * sem universo fixo, onde a chave não significa nada fora de ordenar.
 * Por isso a próxima chave é sempre `max(chaves existentes) + 1`, nunca
 * `count(chaves) + 1`.
 *
 * Módulo puro, sem I/O — quem chama (lib/db/consultas.ts) busca as
 * chaves existentes dentro de uma transação que trava a linha da
 * coleção, para que duas adições concorrentes nunca colidam nem furem a
 * sequência em silêncio (a exclusão mútua é responsabilidade do banco,
 * não deste módulo).
 */

export function proximaChaveSequencial(chavesExistentes: readonly string[]): string {
  let max = 0;
  for (const chave of chavesExistentes) {
    const n = Number(chave);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}
