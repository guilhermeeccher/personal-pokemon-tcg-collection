/**
 * Living Dex — as caixas do HOME: em que caixa e em que posição cada vaga
 * fica, para o usuário arrumar o HOME igual. Módulo puro.
 *
 * ## O arranjo
 *
 * O HOME não impõe ordem nas caixas; quem arruma é o usuário. A base é o
 * "Fully Sorted by Regions" do SuperEffective (dataset de 2026-09,
 * `pokepc/classic.pokepc.net`, MIT), a referência das living dex, com as
 * cosméticas tiradas para caixas próprias:
 *
 * - **30 vagas por caixa** (6 colunas × 5 linhas), na ordem do catálogo
 *   (`dex_forma.ordem`): número nacional; na espécie, a base, a fêmea e as
 *   formas.
 * - **Caixas principais: cada região começa numa caixa nova** (decisão de
 *   2026-10-12). Uma forma nova em Kanto mexe só nas caixas de Kanto, nunca
 *   nas de Johto em diante. As regiões são as faixas da Pokédex Nacional
 *   (`FAIXA_REGIAO`).
 * - **Cosméticas em caixas próprias, depois das principais, corridas** na
 *   ordem do catálogo (decisão de 2026-10-12, que substituiu a de
 *   intercalá-las na espécie). A forma base da espécie fica nas principais
 *   (Vivillon Meadow, Unown A). Uma cosmética nova desloca só as caixas
 *   cosméticas seguintes, nunca as principais.
 * - **Uma sequência por trilha.** Na shiny, forma sem shiny não ocupa lugar.
 * - **Só entra o que conta** (`contaNaTrilha`): seção desligada sai das
 *   caixas e as posições da região se reorganizam (decisão de 2026-10-11).
 *   As cosméticas contam sempre.
 *
 * Conferido em 2026-10-12 contra o dataset, antes de as cosméticas saírem
 * das caixas principais: as mesmas 1.387 vagas, 1.376 na mesma caixa e
 * posição; as 11 restantes trocavam de lugar dentro da própria espécie
 * (lá, Vivillon Icy Snow antes do Meadow e as cores de Flabébé/Floette/
 * Florges em ordem alfabética). A ordem relativa das vagas principais
 * continua a dele; caixa e posição já não, porque ele intercala as
 * cosméticas.
 *
 * Caixa e posição são calculadas, não gravadas: dependem da trilha e das
 * seções ligadas.
 *
 * ## Caixas reservadas no início (D9, 2026-10-12)
 *
 * Quem usa a primeira caixa do HOME para outra coisa (a caixa de
 * "Recebidos", onde cai o que chega dos jogos) via o número da tela uma
 * atrás do real. `reservadas` desloca só o **número** das caixas: Kanto 1
 * passa a ser a caixa `reservadas + 1`. Nome, índice, posição e quais vagas
 * ficam em cada caixa não mudam — o arranjo é o mesmo, só começa depois.
 * Vale para as duas trilhas.
 */
import { contaNaTrilha, vistaDaCategoria, type FormaParaGrade, type TrilhaDex, type VistaDex } from "./dex-grade";
import type { SecoesContadas } from "./dex-secoes";
import { REGIOES, regiaoDoNumero, type Regiao } from "./escopo-pokedex";

export const VAGAS_POR_CAIXA = 30;
export const COLUNAS_CAIXA = 6;
/** Teto das caixas reservadas: folga para quem separa algumas, nunca 200 por engano de digitação. */
export const MAX_CAIXAS_RESERVADAS = 20;

export function ehCaixasReservadas(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_CAIXAS_RESERVADAS;
}

export type FormaParaCaixa = Pick<FormaParaGrade, "numero" | "categoria" | "shinyObtenivel"> & { id: string; ordem: number };

export interface CaixaDex<T extends FormaParaCaixa> {
  /** 1, 2, 3… — a caixa no HOME. */
  numero: number;
  /** Principal (por região) ou das cosméticas (corridas, no fim). */
  vista: VistaDex;
  /** Região da caixa principal; nula nas cosméticas. */
  regiao: Regiao | null;
  /** 1, 2… dentro da região, ou dentro das cosméticas: "Kanto 2", "Cosméticas 3". */
  indice: number;
  /** Até 30, na ordem das posições; a última caixa de cada grupo pode sobrar. */
  vagas: T[];
}

export interface PosicaoNaCaixa {
  caixa: number;
  /** 1 a 30, da esquerda para a direita e de cima para baixo. */
  posicao: number;
}

export function montarCaixasDex<T extends FormaParaCaixa>(
  formas: readonly T[],
  trilha: TrilhaDex,
  secoes: SecoesContadas,
  /** Caixas do HOME antes da Kanto 1 (a de Recebidos, por exemplo). */
  reservadas = 0,
): CaixaDex<T>[] {
  const porRegiao = new Map<Regiao, T[]>();
  const cosmeticas: T[] = [];
  const ordenadas = formas.filter((f) => contaNaTrilha(f, trilha, secoes)).sort((a, b) => a.ordem - b.ordem);
  for (const f of ordenadas) {
    if (vistaDaCategoria(f.categoria) === "cosmeticas") {
      cosmeticas.push(f);
      continue;
    }
    const regiao = regiaoDoNumero(f.numero);
    const lista = porRegiao.get(regiao);
    if (lista) lista.push(f);
    else porRegiao.set(regiao, [f]);
  }

  const caixas: CaixaDex<T>[] = [];
  const empilhar = (vagas: readonly T[], vista: VistaDex, regiao: Regiao | null) => {
    for (let i = 0; i < vagas.length; i += VAGAS_POR_CAIXA) {
      caixas.push({
        numero: reservadas + caixas.length + 1,
        vista,
        regiao,
        indice: i / VAGAS_POR_CAIXA + 1,
        vagas: vagas.slice(i, i + VAGAS_POR_CAIXA),
      });
    }
  };
  for (const regiao of REGIOES) empilhar(porRegiao.get(regiao) ?? [], "principal", regiao);
  empilhar(cosmeticas, "cosmeticas", null);
  return caixas;
}

/** Caixa e posição de cada vaga que está nas caixas, pelo id da vaga. */
export function posicoesNasCaixas(caixas: readonly CaixaDex<FormaParaCaixa>[]): Map<string, PosicaoNaCaixa> {
  const r = new Map<string, PosicaoNaCaixa>();
  for (const c of caixas) c.vagas.forEach((f, i) => r.set(f.id, { caixa: c.numero, posicao: i + 1 }));
  return r;
}
