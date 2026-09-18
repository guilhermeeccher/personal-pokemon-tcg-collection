/**
 * Ordenação natural de `local_id` (número impresso na carta, spec §3.1).
 *
 * `local_id` é texto, não inteiro: sets recentes usam zero-padding
 * ("001", "002"), sets antigos não ("1", "2", ... "100"), e há sufixos de
 * letra ("50a", "50b") e prefixos de série secreta ("H01", "TG01"). Ordem
 * alfabética pura erra ("10" antes de "2"); `Intl.Collator` com
 * `numeric: true` resolve comparando runs de dígitos numericamente e o
 * resto como texto — é o que a grade de cadastro por set usa para exibir
 * as cartas na ordem impressa.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

const collatorLocalId = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/** Comparador para `Array.prototype.sort` por `local_id`. */
export function compararLocalId(a: string, b: string): number {
  return collatorLocalId.compare(a, b);
}
