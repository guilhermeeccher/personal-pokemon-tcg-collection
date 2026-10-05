/**
 * Qual carta "brilha mais" — a capa de cada coleção e as joias da visão
 * geral (2026-10-05). É vitrine, não regra: nada aqui decide alocação nem
 * troca, então não substitui a escada de melhoria (`melhoria-vaga.ts`), que
 * compara idioma e variante e é deliberadamente grossa na raridade.
 *
 * A base é a mesma classificação (`classificarRaridade`, cinco classes). Só
 * que dentro de "secreta" cabe de tudo — de uma Illustration Rare a uma
 * Mega Hiper Rara —, e uma capa escolhida no empate mostraria a ilustração
 * comum de um set que tem a dourada. Por isso há um segundo degrau, só
 * para desempatar a vitrine:
 *
 *   hiper/secreta/dourada/futurística/RGB > ilustração especial > ultra/arte
 *   completa > o resto da classe.
 *
 * Empate restante vai para o maior número impresso: dentro de um set, as
 * cartas mais raras ficam no fim da numeração.
 *
 * Módulo puro, sem I/O.
 */

import { CLASSES_RARIDADE, classificarRaridade } from "./raridade-visual";
import { compararLocalId } from "./ordenacao";

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* Do mais alto para o mais baixo; a primeira lista que casar define o degrau. */
const DEGRAUS_VITRINE: readonly (readonly string[])[] = [
  ["hiper", "hyper", "secret", "gold", "dourad", "futurist", "rgb"],
  ["especial", "special"],
  ["ultra", "full art", "arte completa"],
];

export function pontuarDestaque(raridade: string | null | undefined): [number, number] {
  const classe = CLASSES_RARIDADE.indexOf(classificarRaridade(raridade));
  const texto = normalizar(raridade ?? "");
  const i = DEGRAUS_VITRINE.findIndex((marcadores) => marcadores.some((m) => texto.includes(m)));
  return [classe, i === -1 ? 0 : DEGRAUS_VITRINE.length - i];
}

export interface CartaParaDestaque {
  raridade: string | null;
  localId: string;
}

/** Comparador decrescente: a carta mais vistosa primeiro. */
export function compararDestaque(a: CartaParaDestaque, b: CartaParaDestaque): number {
  const [ca, da] = pontuarDestaque(a.raridade);
  const [cb, db] = pontuarDestaque(b.raridade);
  return cb - ca || db - da || compararLocalId(b.localId, a.localId);
}

export function ordenarPorDestaque<T extends CartaParaDestaque>(cartas: readonly T[]): T[] {
  return cartas.slice().sort(compararDestaque);
}
