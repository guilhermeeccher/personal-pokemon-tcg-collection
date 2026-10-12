/**
 * Living Dex — as contas da Visão geral (`/dex`). Módulo puro.
 *
 * Cada jogo é uma "coleção", como as de carta (pedido de 2026-10-12): a dex
 * daquele jogo são as vagas do catálogo dele (`catalogoDoJogo`) que contam
 * na trilha normal da vista principal. "Pegas" são as que têm algum Pokémon
 * nascido naquele jogo, esteja ele no jogo ou já no HOME; delas, quantas
 * estão no HOME. O que falta se divide em pegável agora e trancado atrás de
 * um checkpoint ainda não conquistado (`especiesTrancadas`).
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
  /** Com algum Pokémon nascido no jogo. */
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
  registros: readonly { formaId: string; shiny: boolean; jogoOrigem: string }[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
  trofeus: readonly TrofeuParaConta[],
  obtidos: ReadonlySet<string>,
): ProgressoJogoDex | null {
  const catalogo = catalogoDoJogo(jogoId, formas);
  if (!catalogo) return null;
  const nascidas = new Set(registros.filter((r) => !r.shiny && r.jogoOrigem === jogoId).map((r) => r.formaId));
  const trancadasPorNumero = especiesTrancadas(trofeus, jogoId, obtidos);

  const r: ProgressoJogoDex = { total: 0, pegas: 0, noHome: 0, faltamAgora: 0, trancadas: [] };
  const porCheckpoint = new Map<string, number>();
  for (const f of formas) {
    if (!catalogo.has(f.id) || vistaDaCategoria(f.categoria) !== "principal" || !contaNaTrilha(f, "normal", secoes)) continue;
    r.total++;
    if (nascidas.has(f.id)) {
      r.pegas++;
      if (estadoDaVaga(mapa, f.id, "normal") === "no_home") r.noHome++;
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
