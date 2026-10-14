/**
 * Living Dex — as contas da Visão geral (`/dex`). Módulo puro.
 *
 * Cada jogo é uma "coleção", como as de carta (pedido de 2026-10-12): a dex
 * daquele jogo são as vagas do catálogo dele (`catalogoDoJogo`) que contam
 * na trilha normal da vista principal. "Pegas" são as que estão na Pokédex,
 * venha o Pokémon de onde vier (pedido de 2026-10-13): o HOME centraliza, e
 * o Bulbasaur que veio do GO é um que também se pega no FireRed. Um que está
 * em outro jogo e ainda não subiu também conta. Delas, quantas estão no HOME.
 * O que falta se divide em pegável agora e trancado atrás de um checkpoint
 * ainda não conquistado (`especiesTrancadas`).
 */
import { catalogoDoJogo, type FormaParaDisponibilidade } from "./dex-disponibilidade";
import { estadoDaVaga, progressoDex, type MapaEstadosDex, type ProgressoTrilha } from "./dex-estado";
import { contaNaTrilha, vistaDaCategoria, type FormaParaGrade, type TrilhaDex } from "./dex-grade";
import type { SecoesContadas } from "./dex-secoes";
import { especiesTrancadas, type TrofeuParaConta } from "./dex-trofeus";
import { REGIOES, regiaoDoNumero, type Regiao } from "./escopo-pokedex";

export type FormaParaVisaoGeral = FormaParaGrade & FormaParaDisponibilidade & { id: string };

export interface ProgressoJogoDex {
  /** Vagas da dex do jogo. */
  total: number;
  /** Na Pokédex (no HOME ou em qualquer jogo), qualquer que seja a origem. */
  pegas: number;
  /** Das pegas, as que estão no HOME. */
  noHome: number;
  /** Ainda não pegas e alcançáveis agora no save. */
  faltamAgora: number;
  /** Ainda não pegas e trancadas, por checkpoint (vaga com dois checkpoints conta nos dois). */
  trancadas: { trofeuId: string; vagas: number }[];
}

/** A dex de um jogo; `null` se o jogo não tem catálogo de disponibilidade. */
export function progressoDoJogo(
  jogoId: string,
  formas: readonly FormaParaVisaoGeral[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
  trofeus: readonly TrofeuParaConta[],
  obtidos: ReadonlySet<string>,
): ProgressoJogoDex | null {
  const catalogo = catalogoDoJogo(jogoId, formas);
  if (!catalogo) return null;
  const trancadasPorNumero = especiesTrancadas(trofeus, jogoId, obtidos);

  const r: ProgressoJogoDex = { total: 0, pegas: 0, noHome: 0, faltamAgora: 0, trancadas: [] };
  const porCheckpoint = new Map<string, number>();
  for (const f of formas) {
    if (!catalogo.has(f.id) || vistaDaCategoria(f.categoria) !== "principal" || !contaNaTrilha(f, "normal", secoes)) continue;
    r.total++;
    const estado = estadoDaVaga(mapa, f.id, "normal");
    if (estado !== "falta") {
      r.pegas++;
      if (estado === "no_home") r.noHome++;
      continue;
    }
    const checkpoints = trancadasPorNumero.get(f.numero);
    if (!checkpoints) r.faltamAgora++;
    else for (const c of checkpoints) porCheckpoint.set(c, (porCheckpoint.get(c) ?? 0) + 1);
  }
  r.trancadas = [...porCheckpoint]
    .map(([trofeuId, vagas]) => ({ trofeuId, vagas }))
    .sort((a, b) => b.vagas - a.vagas);
  return r;
}

/** Progresso da vista principal por região, nas duas trilhas. */
export function progressoPorRegiao(
  formas: readonly (FormaParaGrade & { id: string; especie: string; forma: string | null })[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
): { regiao: Regiao; progresso: Record<TrilhaDex, ProgressoTrilha> }[] {
  const principal = formas.filter((f) => vistaDaCategoria(f.categoria) === "principal");
  return REGIOES.map((regiao) => ({
    regiao,
    progresso: progressoDex(
      principal.filter((f) => regiaoDoNumero(f.numero) === regiao),
      mapa,
      secoes,
    ),
  }));
}

/** As vagas que chegaram ao HOME por último (mais recente primeiro), sem repetir vaga e trilha. */
export function ultimosNoHome(
  registros: readonly { formaId: string; shiny: boolean; local: string; atualizadoEm: string }[],
  quantos: number,
): { formaId: string; shiny: boolean }[] {
  const vistos = new Set<string>();
  const r: { formaId: string; shiny: boolean }[] = [];
  for (const x of [...registros].filter((x) => x.local === "home").sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))) {
    const chave = `${x.formaId}:${x.shiny}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    r.push({ formaId: x.formaId, shiny: x.shiny });
    if (r.length === quantos) break;
  }
  return r;
}

/**
 * "Pegue agora": vagas da vista principal que faltam (normal), que algum jogo
 * ativo do usuário alcança agora sem troca nem evento e sem checkpoint
 * pendente, na ordem do catálogo.
 */
export function pegueAgora(
  jogoIds: readonly string[],
  formas: readonly (FormaParaVisaoGeral & { ordem: number })[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
  trofeus: readonly TrofeuParaConta[],
  obtidos: ReadonlySet<string>,
  quantos: number,
): { formaId: string; jogoId: string }[] {
  const porForma = new Map<string, string>();
  for (const jogoId of jogoIds) {
    const catalogo = catalogoDoJogo(jogoId, formas);
    if (!catalogo) continue;
    const trancadas = especiesTrancadas(trofeus, jogoId, obtidos);
    for (const [formaId, d] of catalogo) {
      if (d.como === "livre" && !porForma.has(formaId)) porForma.set(formaId, jogoId);
    }
    for (const f of formas) if (trancadas.has(f.numero) && porForma.get(f.id) === jogoId) porForma.delete(f.id);
  }
  return [...formas]
    .sort((a, b) => a.ordem - b.ordem)
    .filter(
      (f) =>
        porForma.has(f.id) &&
        vistaDaCategoria(f.categoria) === "principal" &&
        contaNaTrilha(f, "normal", secoes) &&
        estadoDaVaga(mapa, f.id, "normal") === "falta",
    )
    .slice(0, quantos)
    .map((f) => ({ formaId: f.id, jogoId: porForma.get(f.id)! }));
}

/** A estante: troféus conquistados por nível e platinas, somando jogos e HOME. */
export function estanteDeTrofeus(
  trofeus: readonly { jogoId: string; nivel: "bronze" | "prata" | "ouro"; obtido: unknown }[],
): { platina: number; ouro: number; prata: number; bronze: number } {
  const r = { platina: 0, ouro: 0, prata: 0, bronze: 0 };
  const porJogo = new Map<string, { total: number; obtidos: number }>();
  for (const t of trofeus) {
    const j = porJogo.get(t.jogoId) ?? { total: 0, obtidos: 0 };
    j.total++;
    if (t.obtido) {
      j.obtidos++;
      r[t.nivel]++;
    }
    porJogo.set(t.jogoId, j);
  }
  for (const j of porJogo.values()) if (j.total > 0 && j.obtidos === j.total) r.platina++;
  return r;
}

/** Os troféus com data mais recentes (os do HOME não têm data e ficam fora). */
export function ultimasConquistas<T extends { obtido: { em: string | null } | null; ordem: number }>(
  trofeus: readonly T[],
  quantas: number,
): T[] {
  return trofeus
    .filter((t) => t.obtido?.em)
    .sort((a, b) => b.obtido!.em!.localeCompare(a.obtido!.em!) || b.ordem - a.ordem)
    .slice(0, quantas);
}
