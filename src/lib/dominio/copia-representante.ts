/**
 * A cópia que representa uma carta quando uma tela mostra a **carta** e o
 * detalhe da v2 só abre a partir de uma **cópia** (modo cópia,
 * `GET /api/cartas/:cartaId/detalhe?copia=`). Módulo puro; a leitura é de
 * `lib/db/copia-representante.ts`.
 *
 * É o caso das repetidas e das joias da visão geral: a linha é uma carta
 * física (`carta_id`, através dos idiomas de catálogo e dos idiomas físicos),
 * não uma cópia. O detalhe lista **todas** as cópias da carta e deixa focar
 * outra, então a escolha só decide por onde ele abre — mas decide de forma
 * estável, para a mesma carta abrir sempre na mesma cópia:
 *
 * 1. a cópia **livre** antes da alocada: nas repetidas o assunto é o que
 *    sobra, e é numa cópia livre que o detalhe oferece alocar, e não numa
 *    que já ocupa uma vaga;
 * 2. entre iguais, a mais **antiga** (`criadoEm`);
 * 3. empate: o menor `id`, só para o resultado não depender da ordem em que o
 *    banco devolveu as linhas.
 */

export interface CopiaParaRepresentar {
  id: string;
  cartaId: string;
  /** Ocupa uma vaga (regra 1: no máximo uma). */
  alocada: boolean;
  /** Instante de criação da linha, em milissegundos (`Date.getTime()`). */
  criadoEmMs: number;
}

function vemAntes(a: CopiaParaRepresentar, b: CopiaParaRepresentar): boolean {
  if (a.alocada !== b.alocada) return !a.alocada;
  if (a.criadoEmMs !== b.criadoEmMs) return a.criadoEmMs < b.criadoEmMs;
  return a.id < b.id;
}

/** `carta_id` → id da cópia que a representa. Uma carta sem cópia não entra no mapa. */
export function escolherRepresentantes(copias: readonly CopiaParaRepresentar[]): Map<string, string> {
  const escolhidas = new Map<string, CopiaParaRepresentar>();
  for (const c of copias) {
    const atual = escolhidas.get(c.cartaId);
    if (!atual || vemAntes(c, atual)) escolhidas.set(c.cartaId, c);
  }
  return new Map([...escolhidas].map(([cartaId, c]) => [cartaId, c.id]));
}
