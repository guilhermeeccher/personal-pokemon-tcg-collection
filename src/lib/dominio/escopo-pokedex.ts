/**
 * Faixas de região da Pokédex Nacional e resolução do universo de números
 * de uma coleção tipo `pokedex` (spec §3.3, §4 regra 2).
 *
 * O escopo de uma coleção Pokédex é `nacional` (1–1025) ou uma ou mais
 * regiões — nesse caso o universo é a união das faixas, ordenada e sem
 * duplicata (uma região não se sobrepõe a outra, mas a função não assume
 * isso: uma coleção "Kanto + Kanto" não deveria dobrar a vaga 1).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

export const REGIOES = [
  "kanto",
  "johto",
  "hoenn",
  "sinnoh",
  "unova",
  "kalos",
  "alola",
  "galar",
  "paldea",
] as const;

export type Regiao = (typeof REGIOES)[number];

/** Faixas oficiais da Pokédex Nacional por região (spec §3.3). */
export const FAIXA_REGIAO: Record<Regiao, { inicio: number; fim: number }> = {
  kanto: { inicio: 1, fim: 151 },
  johto: { inicio: 152, fim: 251 },
  hoenn: { inicio: 252, fim: 386 },
  sinnoh: { inicio: 387, fim: 493 },
  unova: { inicio: 494, fim: 649 },
  kalos: { inicio: 650, fim: 721 },
  alola: { inicio: 722, fim: 809 },
  galar: { inicio: 810, fim: 905 },
  paldea: { inicio: 906, fim: 1025 },
};

export const POKEDEX_NACIONAL_INICIO = 1;
export const POKEDEX_NACIONAL_FIM = 1025;

export function ehRegiao(v: unknown): v is Regiao {
  return typeof v === "string" && (REGIOES as readonly string[]).includes(v);
}

/**
 * Região dona de um número da Pokédex Nacional. As faixas (`FAIXA_REGIAO`)
 * particionam 1..1025 sem lacuna nem sobreposição (validado em
 * `escopo-pokedex.test.ts`), então todo número de 1 a 1025 tem exatamente
 * uma região — usado pelo escopo editável (item 1) para agrupar vagas
 * removidas na mensagem de recusa, e pelo progresso por região (item 2).
 * Fora de 1..1025 é erro de chamada, não caso a tratar em silêncio.
 */
export function regiaoDoNumero(n: number): Regiao {
  for (const regiao of REGIOES) {
    const faixa = FAIXA_REGIAO[regiao];
    if (n >= faixa.inicio && n <= faixa.fim) return regiao;
  }
  throw new Error(`Número de Pokédex fora do universo conhecido (1..1025): ${n}`);
}

/**
 * Resolve o universo de números de Pokédex de um escopo `nacional`.
 * Sempre 1..1025, ordenado.
 */
export function resolverEscopoNacional(): number[] {
  const numeros: number[] = [];
  for (let n = POKEDEX_NACIONAL_INICIO; n <= POKEDEX_NACIONAL_FIM; n++) {
    numeros.push(n);
  }
  return numeros;
}

/**
 * Resolve o universo de números de Pokédex da união de uma ou mais
 * regiões — ordenado, sem duplicata mesmo que a mesma região apareça
 * mais de uma vez na lista.
 */
export function resolverEscopoRegioes(regioes: readonly Regiao[]): number[] {
  const numeros = new Set<number>();
  for (const regiao of regioes) {
    const faixa = FAIXA_REGIAO[regiao];
    for (let n = faixa.inicio; n <= faixa.fim; n++) {
      numeros.add(n);
    }
  }
  return [...numeros].sort((a, b) => a - b);
}
