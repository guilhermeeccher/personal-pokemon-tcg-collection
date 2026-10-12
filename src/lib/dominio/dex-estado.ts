/**
 * Living Dex — estado de cada vaga, derivado dos registros (regra 3 da
 * spec: nunca gravado). Módulo puro.
 *
 *  - **falta**: nenhum registro da forma nesta trilha;
 *  - **no jogo**: há registro, nenhum no HOME;
 *  - **no HOME**: ao menos um registro no HOME.
 *
 * Duas trilhas, e um registro preenche uma só (regra 2): o shiny preenche a
 * trilha shiny, o não shiny a normal. Nunca as duas.
 */
import type { CategoriaFormaDex } from "./dex-classificacao";
import { contaNaTrilha, type TrilhaDex } from "./dex-grade";
import { LOCAL_HOME } from "./dex-jogos";
import type { SecoesContadas } from "./dex-secoes";

export type EstadoVagaDex = "falta" | "no_jogo" | "no_home";

export interface RegistroParaEstado {
  formaId: string;
  shiny: boolean;
  local: string;
}

/** `formaId:trilha` → estado. Vaga ausente do mapa está em falta. */
export type MapaEstadosDex = ReadonlyMap<string, EstadoVagaDex>;

const chave = (formaId: string, trilha: TrilhaDex) => `${formaId}:${trilha}`;

export function mapearEstadosDex(registros: readonly RegistroParaEstado[]): MapaEstadosDex {
  const mapa = new Map<string, EstadoVagaDex>();
  for (const r of registros) {
    const k = chave(r.formaId, r.shiny ? "shiny" : "normal");
    if (r.local === LOCAL_HOME) mapa.set(k, "no_home");
    else if (mapa.get(k) !== "no_home") mapa.set(k, "no_jogo");
  }
  return mapa;
}

export function estadoDaVaga(mapa: MapaEstadosDex, formaId: string, trilha: TrilhaDex): EstadoVagaDex {
  return mapa.get(chave(formaId, trilha)) ?? "falta";
}

export interface ProgressoTrilha {
  /** Vagas que contam nesta trilha (seções ligadas, e shiny obtenível na shiny). */
  contam: number;
  noHome: number;
  noJogo: number;
}

/**
 * Progresso das duas trilhas sobre as vagas dadas. Só vaga que conta entra:
 * um registro numa seção desligada, ou o shiny de uma forma marcada "sem
 * shiny", aparece na grade mas não soma aqui.
 */
export function progressoDex(
  formas: readonly { id: string; categoria: CategoriaFormaDex; shinyObtenivel: boolean; numero: number; especie: string; forma: string | null }[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
): Record<TrilhaDex, ProgressoTrilha> {
  const resultado: Record<TrilhaDex, ProgressoTrilha> = {
    normal: { contam: 0, noHome: 0, noJogo: 0 },
    shiny: { contam: 0, noHome: 0, noJogo: 0 },
  };
  for (const f of formas) {
    for (const trilha of ["normal", "shiny"] as const) {
      if (!contaNaTrilha(f, trilha, secoes)) continue;
      const p = resultado[trilha];
      p.contam++;
      const estado = estadoDaVaga(mapa, f.id, trilha);
      if (estado === "no_home") p.noHome++;
      else if (estado === "no_jogo") p.noJogo++;
    }
  }
  return resultado;
}
