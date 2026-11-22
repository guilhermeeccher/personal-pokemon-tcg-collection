/**
 * A ordem da lista de coleções (decisão de 2026-11-22): grupos de um nível
 * só, cada coleção em no máximo um, e a ordem trocada por botões de subir e
 * descer — nunca arrastar, que briga com a rolagem da página no celular (a
 * mesma escolha das etapas de tarefa da Dex).
 *
 * **Fonte única.** `listarColecoes` devolve as coleções já nesta ordem, e
 * tudo o que lê de lá (a tela de coleções, o Início, "O que falta", a visão
 * geral) herda a mesma sequência sem ordenar de novo. O SQL só busca; quem
 * ordena é `ordenarColecoes`:
 *
 *  - os grupos por `grupo_colecao.ordem`;
 *  - dentro de cada grupo, as coleções por `colecao.ordem`;
 *  - por último as "sem grupo", também por `ordem`.
 *
 * Empate de `ordem` desempata pela mais nova primeiro (`criadoEm` desc), que
 * era a ordem da lista antes de haver ordem: a migração 0034 numerou as
 * existentes assim, e duas criações simultâneas que caiam na mesma posição
 * ficam numa ordem estável até a próxima renumeração. Depois, o `id`, só
 * para a ordem nunca depender de como o banco devolveu as linhas.
 *
 * **Reordenar recebe a lista inteira, e ela tem de ser exatamente o conjunto
 * atual** (`conferirNovaOrdem`). Uma lista velha — outra aba criou, moveu ou
 * excluiu uma coleção — é recusada com 409 em vez de ser aplicada pela
 * metade, o que perderia ou duplicaria posições. Aplicar renumera 0..n-1.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { moverNaOrdem as moverNaOrdemDaLista } from "./dex-etapas";

/** O que a ordem precisa de uma coleção. `criadoEm` vem `Date` do banco e texto ISO do DTO. */
export interface ColecaoOrdenavel {
  id: string;
  grupoId: string | null;
  ordem: number;
  criadoEm: Date | string;
}

export interface GrupoOrdenavel {
  id: string;
  ordem: number;
  criadoEm: Date | string;
}

interface ItemOrdenavel {
  id: string;
  ordem: number;
  criadoEm: Date | string;
}

function instante(v: Date | string): number {
  return typeof v === "string" ? Date.parse(v) : v.getTime();
}

/** `ordem` crescente; empate pela mais nova primeiro; depois o `id`. */
export function compararNaSecao(a: ItemOrdenavel, b: ItemOrdenavel): number {
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  const porData = instante(b.criadoEm) - instante(a.criadoEm);
  if (porData !== 0) return porData;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Uma seção (os grupos entre si, ou as coleções de um grupo) na ordem de exibição. */
export function ordenarNaSecao<T extends ItemOrdenavel>(itens: readonly T[]): T[] {
  return [...itens].sort(compararNaSecao);
}

/**
 * Uma seção da lista: o grupo, ou `null` para "sem grupo", com as coleções
 * dele em ordem. "Sem grupo" vem sempre por último e só aparece quando tem
 * coleção; um grupo vazio aparece (o usuário acabou de criá-lo e vai enchê-lo).
 */
export interface SecaoDeColecoes<T, G> {
  grupo: G | null;
  colecoes: T[];
}

/**
 * As seções da lista na ordem de exibição. Coleção que aponta para um grupo
 * que não está na lista (não deveria acontecer: a FK zera o grupo excluído)
 * cai em "sem grupo" em vez de sumir.
 */
export function secoesDeColecoes<T extends ColecaoOrdenavel, G extends GrupoOrdenavel>(
  colecoes: readonly T[],
  grupos: readonly G[],
): SecaoDeColecoes<T, G>[] {
  const ordenados = ordenarNaSecao(grupos);
  const conhecidos = new Set(ordenados.map((g) => g.id));
  const porGrupo = new Map<string | null, T[]>();
  for (const c of colecoes) {
    const chave = c.grupoId !== null && conhecidos.has(c.grupoId) ? c.grupoId : null;
    const lista = porGrupo.get(chave);
    if (lista) lista.push(c);
    else porGrupo.set(chave, [c]);
  }
  const secoes: SecaoDeColecoes<T, G>[] = ordenados.map((g) => ({
    grupo: g,
    colecoes: ordenarNaSecao(porGrupo.get(g.id) ?? []),
  }));
  const semGrupo = porGrupo.get(null) ?? [];
  if (semGrupo.length > 0) secoes.push({ grupo: null, colecoes: ordenarNaSecao(semGrupo) });
  return secoes;
}

/** A lista inteira na ordem de exibição: as seções de `secoesDeColecoes`, achatadas. */
export function ordenarColecoes<T extends ColecaoOrdenavel>(
  colecoes: readonly T[],
  grupos: readonly GrupoOrdenavel[],
): T[] {
  return secoesDeColecoes(colecoes, grupos).flatMap((s) => s.colecoes);
}

/** Os ids de uma seção (`grupoId` nulo = "sem grupo") na ordem de exibição. */
export function idsDaSecao(
  colecoes: readonly ColecaoOrdenavel[],
  grupoId: string | null,
): string[] {
  return ordenarNaSecao(colecoes.filter((c) => c.grupoId === grupoId)).map((c) => c.id);
}

/** A posição de quem entra no fim de uma seção: uma depois da maior, ou 0 na seção vazia. */
export function proximaOrdem(ordens: readonly number[]): number {
  return ordens.length === 0 ? 0 : Math.max(...ordens) + 1;
}

export type ConferenciaDeOrdem =
  | { ok: true; ids: string[] }
  /** Não é lista de textos, ou repete id: corpo que a tela não emite (400). */
  | { ok: false; motivo: "formato" }
  /** Outro conjunto que não o atual: lista velha de outra aba (409). */
  | { ok: false; motivo: "desatualizada" };

/**
 * Confere a ordem pedida contra os ids atuais da seção: tem de ser
 * exatamente o mesmo conjunto, sem repetição. Devolve os ids na ordem nova
 * (a posição de cada um é o índice).
 */
export function conferirNovaOrdem(atuais: readonly string[], pedida: unknown): ConferenciaDeOrdem {
  if (!Array.isArray(pedida) || !pedida.every((x) => typeof x === "string")) {
    return { ok: false, motivo: "formato" };
  }
  const ids = pedida as string[];
  const conjunto = new Set(ids);
  if (conjunto.size !== ids.length) return { ok: false, motivo: "formato" };
  if (ids.length !== atuais.length || atuais.some((id) => !conjunto.has(id))) {
    return { ok: false, motivo: "desatualizada" };
  }
  return { ok: true, ids };
}

/**
 * Renumera uma seção 0..n-1 na ordem dada e devolve só quem muda de posição —
 * a escrita toca o mínimo de linhas.
 */
export function posicoesQueMudam(
  ids: readonly string[],
  ordemAtual: ReadonlyMap<string, number>,
): { id: string; ordem: number }[] {
  return ids
    .map((id, ordem) => ({ id, ordem }))
    .filter(({ id, ordem }) => ordemAtual.get(id) !== ordem);
}

/**
 * Quem entra no fim de uma seção, na ordem dada: posições a partir de uma
 * depois da maior que a seção já tem (`proximaOrdem`).
 */
export function anexarAoFim(
  ids: readonly string[],
  ordensDoDestino: readonly number[],
): { id: string; ordem: number }[] {
  const inicio = proximaOrdem(ordensDoDestino);
  return ids.map((id, i) => ({ id, ordem: inicio + i }));
}

/**
 * Sobe (`-1`) ou desce (`+1`) um id uma posição; na borda, a mesma ordem. É a
 * mesma regra das etapas de tarefa da Dex, reexportada para a tela de coleções
 * montar a lista que manda em `PUT .../ordem`.
 */
export const moverNaOrdem: (ids: readonly string[], id: string, direcao: -1 | 1) => string[] =
  moverNaOrdemDaLista;
