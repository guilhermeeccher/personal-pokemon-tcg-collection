/**
 * Dado o tipo e o parâmetro de uma coleção, produz a lista de chaves de
 * vaga a materializar (spec §3.3, §4 regra 4). Função pura, sem banco —
 * quem chama já buscou no catálogo o que for necessário e passa por
 * argumento.
 *
 * - `pokedex`: as chaves são os números do escopo (`escopo-pokedex.ts`),
 *   como texto.
 * - `set`: as chaves são os `local_id` das cartas do set, ordenados de
 *   forma natural (`ordenacao.ts` — sets têm `local_id` não-numérico:
 *   promos, "TG01", "SV001") e cortados na contagem oficial ou total
 *   (regra 4: a flag "incluir secretas" troca para `cardCount.total`).
 * - `customizada`: nenhuma vaga nasce na criação — a vaga nasce ao
 *   alocar (parte B), com chave sequencial. Aqui sempre devolve `[]`.
 *
 * Validado contra o set 151 (`sv03.5`, spec §6 Fase 2): 207 `local_id`
 * numéricos zero-padded ("001".."207"), corte em 165 = oficiais, corte em
 * 207 = com secretas — bate exatamente com os critérios de aceite.
 *
 * Exceção tratada por `numeracao-oficial-set.ts`: quando `qtdOficial`
 * vem 0 do upstream mas o set tem cartas no catálogo (caso `mep`), o
 * corte usa `qtdTotal` no lugar — nunca corta em 0 e produz coleção
 * vazia em silêncio.
 */

import { compararLocalId } from "./ordenacao";
import {
  resolverEscopoNacional,
  resolverEscopoRegioes,
} from "./escopo-pokedex";
import { resolverUniversoVagasSet } from "./numeracao-oficial-set";
import type { ParametroPokedex } from "./parametro-colecao";

export function resolverChavesVagasPokedex(
  parametro: ParametroPokedex,
): string[] {
  const numeros =
    parametro.escopo === "nacional"
      ? resolverEscopoNacional()
      : resolverEscopoRegioes(parametro.regioes);
  return numeros.map(String);
}

export interface EntradaVagasSet {
  /** Todos os `local_id` das cartas do set, no idioma de catálogo escolhido. */
  localIdsDoSet: readonly string[];
  /** `carta_catalogo.set_qtd_oficial` — numeração oficial (regra 4). */
  qtdOficial: number;
  /** `carta_catalogo.set_qtd_total` — com secretas (regra 4). */
  qtdTotal: number;
  incluirSecretas: boolean;
}

/**
 * Corta a lista de `local_id` do set, ordenada naturalmente, na contagem
 * oficial (ou total, com a flag) — exceto no caso degenerado de set sem
 * numeração oficial (`resolverUniversoVagasSet`), em que o corte usa
 * `qtdTotal`. As chaves vêm das cartas reais do catálogo — nunca de um
 * range numérico gerado.
 */
export function resolverChavesVagasSet(entrada: EntradaVagasSet): string[] {
  const { vagasEsperadas } = resolverUniversoVagasSet({
    qtdOficial: entrada.qtdOficial,
    qtdTotal: entrada.qtdTotal,
    incluirSecretas: entrada.incluirSecretas,
    qtdCartasNoCatalogo: entrada.localIdsDoSet.length,
  });
  return [...entrada.localIdsDoSet].sort(compararLocalId).slice(0, vagasEsperadas);
}

/** `customizada`: nenhuma vaga é gerada na criação (spec §3.3). */
export function resolverChavesVagasCustomizada(): string[] {
  return [];
}

export type EntradaResolverChavesVagas =
  | { tipo: "pokedex"; parametro: ParametroPokedex }
  | ({ tipo: "set" } & EntradaVagasSet)
  | { tipo: "customizada" };

/** Dispatcher por tipo — o que a rota de criação de coleção chama. */
export function resolverChavesVagas(
  entrada: EntradaResolverChavesVagas,
): string[] {
  switch (entrada.tipo) {
    case "pokedex":
      return resolverChavesVagasPokedex(entrada.parametro);
    case "set":
      return resolverChavesVagasSet(entrada);
    case "customizada":
      return resolverChavesVagasCustomizada();
  }
}
