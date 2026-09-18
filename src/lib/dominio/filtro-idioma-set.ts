/**
 * Filtro de idioma do CATÁLOGO no seletor de expansão — "em quais
 * idiomas a TCGdex tem esta expansão", não o idioma da carta física
 * (esse é `idioma` da `copia`, regra 7 do AGENTS.md, e é
 * decidido no cadastro da cópia, nunca aqui). Um set com
 * `idiomasDisponiveis: ["en"]` só passa no filtro "Inglês" ou "Todos" —
 * mas continua podendo receber cópia física em qualquer idioma.
 *
 * Opções derivadas dos dados, nunca de uma lista fixa no código: quando
 * o japonês entrar no catálogo (bloqueado hoje porque a API da TCGdex
 * está fora do ar), `derivarOpcoesFiltroIdioma` passa a devolver a opção
 * sozinha, sem reescrever filtro nem rótulo — e sem expor "Japonês"
 * enquanto nenhum set tiver essa linha (pedido explícito da tarefa).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { IDIOMAS, type Idioma } from "./enums";

export const FILTRO_IDIOMA_TODOS = "todos" as const;
export type FiltroIdiomaSet = Idioma | typeof FILTRO_IDIOMA_TODOS;

const ROTULOS_IDIOMA: Record<Idioma, string> = {
  pt: "Português",
  en: "Inglês",
  jp: "Japonês",
};

/** Rótulo de exibição da opção de filtro ("Todos" para o valor especial). */
export function rotuloFiltroIdioma(filtro: FiltroIdiomaSet): string {
  return filtro === FILTRO_IDIOMA_TODOS ? "Todos" : ROTULOS_IDIOMA[filtro];
}

export interface SetComIdiomasDisponiveis {
  idiomasDisponiveis: readonly Idioma[];
}

/**
 * Opções de filtro presentes nos dados, na ordem canônica de `IDIOMAS`
 * (pt, en, jp) — nunca inclui idioma que nenhum set do catálogo tenha.
 * "Todos" não entra aqui: é o padrão, tratado à parte por quem chama.
 */
export function derivarOpcoesFiltroIdioma<T extends SetComIdiomasDisponiveis>(
  sets: readonly T[],
): Idioma[] {
  const presentes = new Set<Idioma>();
  for (const s of sets) {
    for (const idioma of s.idiomasDisponiveis) presentes.add(idioma);
  }
  return IDIOMAS.filter((idioma) => presentes.has(idioma));
}

/**
 * "Todos" (padrão) não filtra nada. Caso contrário, mantém só os sets
 * cujo catálogo tem linha naquele idioma — combina livremente com
 * qualquer outro filtro aplicado antes ou depois (ex.: busca por nome).
 */
export function filtrarSetsPorIdioma<T extends SetComIdiomasDisponiveis>(
  sets: readonly T[],
  filtro: FiltroIdiomaSet,
): T[] {
  if (filtro === FILTRO_IDIOMA_TODOS) return [...sets];
  return sets.filter((s) => s.idiomasDisponiveis.includes(filtro));
}

export interface OpcaoFiltroIdioma {
  filtro: FiltroIdiomaSet;
  rotulo: string;
  /** Quantos sets essa opção mostraria — sempre sobre o conjunto COMPLETO. */
  quantidade: number;
}

/**
 * Opções de filtro com a contagem de sets que cada uma mostraria — achado
 * do coordenador (2026-08-25): com "Todos" e "Inglês" empatados em 199
 * (todo set sincronizado tem linha `en`), o filtro parece quebrado sem a
 * contagem visível. A contagem é sempre sobre `sets` (o conjunto
 * completo do catálogo) — NUNCA sobre um resultado já filtrado por busca
 * de texto, senão o número fica "dançando" enquanto o usuário digita.
 * Reaproveita `filtrarSetsPorIdioma`/`derivarOpcoesFiltroIdioma` — não
 * duplica a regra de quem casa com quem.
 */
export function derivarOpcoesFiltroIdiomaComContagem<T extends SetComIdiomasDisponiveis>(
  sets: readonly T[],
): OpcaoFiltroIdioma[] {
  const filtros: FiltroIdiomaSet[] = [FILTRO_IDIOMA_TODOS, ...derivarOpcoesFiltroIdioma(sets)];
  return filtros.map((filtro) => ({
    filtro,
    rotulo: rotuloFiltroIdioma(filtro),
    quantidade: filtrarSetsPorIdioma(sets, filtro).length,
  }));
}
