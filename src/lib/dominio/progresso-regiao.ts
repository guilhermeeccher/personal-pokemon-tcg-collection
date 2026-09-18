/**
 * Progresso por região de uma coleção `pokedex` (item 2 do incremento
 * sobre a Fase 2): "Kanto 87/151 · Johto 12/100". Serve tanto escopo
 * parcial (só as regiões presentes aparecem) quanto nacional (as 9).
 *
 * Módulo puro, sem I/O — recebe as vagas já carregadas (a mesma consulta
 * que já monta a tela da coleção, `obterColecaoComVagas`) e não dispara
 * nenhuma consulta própria.
 */

import { REGIOES, type Regiao, regiaoDoNumero } from "./escopo-pokedex";

export interface VagaParaProgresso {
  chave: string;
  preenchida: boolean;
}

export interface ProgressoRegiao {
  regiao: Regiao;
  total: number;
  preenchidas: number;
}

/**
 * Agrupa vagas por região, na ordem canônica Kanto → Paldea. Só entram
 * regiões com ao menos uma vaga no escopo da coleção — uma Pokédex só
 * de Kanto nunca lista Johto com 0/0.
 */
export function calcularProgressoPorRegiao(
  vagas: readonly VagaParaProgresso[],
): ProgressoRegiao[] {
  const acumulado = new Map<Regiao, { total: number; preenchidas: number }>();
  for (const v of vagas) {
    const n = Number(v.chave);
    if (!Number.isInteger(n)) continue; // defensivo: só chaves de pokedex chegam aqui
    const regiao = regiaoDoNumero(n);
    const atual = acumulado.get(regiao) ?? { total: 0, preenchidas: 0 };
    atual.total += 1;
    if (v.preenchida) atual.preenchidas += 1;
    acumulado.set(regiao, atual);
  }
  return REGIOES.filter((r) => acumulado.has(r)).map((r) => ({
    regiao: r,
    ...acumulado.get(r)!,
  }));
}
