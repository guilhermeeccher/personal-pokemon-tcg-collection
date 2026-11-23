/**
 * O que cada vaga da grade da Pokédex diz, na trilha escolhida — a mesma
 * leitura da grade da v1 (`(v1)/v1/dex/pokedex/grade-pokedex.tsx`), tirada do
 * desenho para ficar testável. Módulo puro.
 *
 * O estado é derivado dos registros a cada leitura, nunca guardado
 * (`dex-estado.ts`). Uma vaga que não conta (seção desligada, ou sem shiny
 * na trilha shiny) **continua na grade**: sai só do total (AGENTS.md,
 * "Sections and views", "Two tracks").
 */
import type { CategoriaFormaDex } from "@/lib/dominio/dex-classificacao";
import { estadoDaVaga, type EstadoVagaDex, type MapaEstadosDex } from "@/lib/dominio/dex-estado";
import { contaNaTrilha, type TrilhaDex } from "@/lib/dominio/dex-grade";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";

export interface ResumoCelula {
  estado: EstadoVagaDex;
  /** Trilha shiny e a forma nunca saiu shiny: fica na grade, fora do total. */
  semShiny: boolean;
  /** A seção da forma está desligada: fica na grade, fora do total. */
  foraDaConta: boolean;
  /** Entra no total desta trilha. */
  conta: boolean;
  /** O sprite vai apagado: falta, ou não existe shiny para pegar. */
  apagado: boolean;
}

export function resumoDaCelula(
  forma: { id: string; categoria: CategoriaFormaDex; shinyObtenivel: boolean },
  trilha: TrilhaDex,
  secoes: SecoesContadas,
  estados: MapaEstadosDex,
): ResumoCelula {
  const estado = estadoDaVaga(estados, forma.id, trilha);
  const semShiny = trilha === "shiny" && !forma.shinyObtenivel;
  return {
    estado,
    semShiny,
    foraDaConta: !categoriaConta(forma.categoria, secoes),
    conta: contaNaTrilha(forma, trilha, secoes),
    apagado: semShiny || estado === "falta",
  };
}

/** O número nacional como a grade o escreve: `#0025`. */
export function numeroDex(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}
