/**
 * O rótulo de uma raridade na lista: a entrada de `raridadesCarta` (chaveada
 * pela raridade em inglês, como o upstream a escreve; a da linha em português
 * cai no próprio texto), ou o texto como foi gravado. Chave com `.` não existe
 * no next-intl (`Rare Holo LV.X`), então mostra como está. Sem raridade, o
 * texto de "sem raridade". O mesmo cuidado do detalhe (`secoes.tsx`).
 */

interface Tradutor {
  (chave: string): string;
  has(chave: string): boolean;
}

export function rotuloDaRaridade(tRaridades: Tradutor, semRaridade: string, raridade: string | null): string {
  if (raridade === null) return semRaridade;
  if (raridade.includes(".")) return raridade;
  return tRaridades.has(raridade) ? tRaridades(raridade) : raridade;
}
