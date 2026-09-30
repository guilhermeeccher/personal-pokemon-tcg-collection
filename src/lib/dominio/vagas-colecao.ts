/**
 * Dado o tipo e o parâmetro de uma coleção, produz a lista de chaves de
 * vaga a materializar (spec §3.3, §4 regra 4). Função pura, sem banco —
 * quem chama já buscou no catálogo o que for necessário e passa por
 * argumento.
 *
 * - `pokedex`: as chaves são os números do escopo (`escopo-pokedex.ts`),
 *   como texto.
 * - `set`: uma vaga por carta de cada set da receita, com a chave
 *   qualificada pelo set (`chaveVagaSet`: `30th/001`). Dentro de cada set,
 *   os `local_id` das cartas, ordenados de forma natural (`ordenacao.ts` — sets têm `local_id` não-numérico:
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

import { chaveVagaSet } from "./chave-vaga-set";
import { compararLocalId } from "./ordenacao";
import {
  resolverEscopoNacional,
  resolverEscopoRegioes,
} from "./escopo-pokedex";
import {
  detectarCatalogoIncompleto,
  type AvisoCatalogoIncompleto,
} from "./catalogo-incompleto";
import {
  resolverUniversoVagasSet,
  type AvisoSemNumeracaoOficial,
} from "./numeracao-oficial-set";
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

export interface EntradaSetDaReceita {
  setId: string;
  /** Todos os `local_id` do set (carta a carta, `escolherLinhaPorCarta`). */
  localIdsDoSet: readonly string[];
  qtdOficial: number;
  qtdTotal: number;
}

/**
 * As chaves de uma coleção de set: cada set da receita cortado pela regra
 * 4 (`resolverChavesVagasSet`), na ordem da receita, qualificado pelo set,
 * e sem as cartas que o usuário tirou (`excluidas`).
 */
export function resolverChavesVagasReceita(
  sets: readonly EntradaSetDaReceita[],
  incluirSecretas: boolean,
  excluidas: readonly string[] = [],
): string[] {
  const fora = new Set(excluidas);
  return sets.flatMap((set) =>
    resolverChavesVagasSet({ ...set, incluirSecretas })
      .map((localId) => chaveVagaSet(set.setId, localId))
      .filter((chave) => !fora.has(chave)),
  );
}

export interface AvisosDaReceita {
  avisoCatalogoIncompleto: AvisoCatalogoIncompleto | null;
  avisoSemNumeracaoOficial: AvisoSemNumeracaoOficial | null;
}

/**
 * Os avisos de uma coleção de set, somados por set da receita.
 *
 * **Medem o CATÁLOGO, não as vagas (2026-09-30).** Antes o aviso de
 * incompleto comparava as vagas da coleção com o universo esperado; com a
 * coleção editável carta a carta, uma exclusão do usuário viraria um falso
 * "catálogo incompleto", e uma carta avulsa esconderia um buraco de verdade.
 * O que se compara agora é quantas vagas o catálogo conseguiria materializar
 * para cada set contra quantas a regra 4 pede — exatamente a pergunta "o
 * upstream conhece o set inteiro?".
 */
export function avisosDaReceita(
  sets: readonly EntradaSetDaReceita[],
  incluirSecretas: boolean,
): AvisosDaReceita {
  let materializaveis = 0;
  let esperadas = 0;
  let totalSemNumeracao = 0;
  let algumSemNumeracao = false;
  for (const set of sets) {
    const universo = resolverUniversoVagasSet({
      qtdOficial: set.qtdOficial,
      qtdTotal: set.qtdTotal,
      incluirSecretas,
      qtdCartasNoCatalogo: set.localIdsDoSet.length,
    });
    esperadas += universo.vagasEsperadas;
    materializaveis += resolverChavesVagasSet({ ...set, incluirSecretas }).length;
    if (universo.avisoSemNumeracaoOficial) {
      algumSemNumeracao = true;
      totalSemNumeracao += universo.avisoSemNumeracaoOficial.qtdTotal;
    }
  }
  return {
    avisoCatalogoIncompleto: detectarCatalogoIncompleto(materializaveis, esperadas),
    avisoSemNumeracaoOficial: algumSemNumeracao ? { qtdTotal: totalSemNumeracao } : null,
  };
}

/** `customizada`: nenhuma vaga é gerada na criação (spec §3.3). */
export function resolverChavesVagasCustomizada(): string[] {
  return [];
}

export type EntradaResolverChavesVagas =
  | { tipo: "pokedex"; parametro: ParametroPokedex }
  | {
      tipo: "set";
      sets: readonly EntradaSetDaReceita[];
      incluirSecretas: boolean;
      excluidas?: readonly string[];
    }
  | { tipo: "customizada" };

/** Dispatcher por tipo — o que a rota de criação de coleção chama. */
export function resolverChavesVagas(
  entrada: EntradaResolverChavesVagas,
): string[] {
  switch (entrada.tipo) {
    case "pokedex":
      return resolverChavesVagasPokedex(entrada.parametro);
    case "set":
      return resolverChavesVagasReceita(entrada.sets, entrada.incluirSecretas, entrada.excluidas);
    case "customizada":
      return resolverChavesVagasCustomizada();
  }
}
