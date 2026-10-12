/**
 * Living Dex — as caixas do HOME: em que caixa e em que posição cada vaga
 * fica, para o usuário arrumar o HOME igual. Módulo puro.
 *
 * ## O arranjo
 *
 * O HOME não impõe ordem nas caixas; quem arruma é o usuário. O arranjo
 * daqui é o "Fully Sorted by Regions" do SuperEffective (dataset de
 * 2026-09, `pokepc/classic.pokepc.net`, MIT), a referência das living dex:
 *
 * - **30 vagas por caixa** (6 colunas × 5 linhas), na ordem do catálogo
 *   (`dex_forma.ordem`): número nacional; na espécie, a base, a fêmea e as
 *   formas.
 * - **Cada região começa numa caixa nova** (decisão de 2026-10-12). Uma
 *   forma nova em Kanto mexe só nas caixas de Kanto, nunca nas de Johto em
 *   diante. As regiões são as faixas da Pokédex Nacional (`FAIXA_REGIAO`).
 * - **Uma sequência por trilha.** Na shiny, forma sem shiny não ocupa lugar.
 * - **Só entra o que conta** (`contaNaTrilha`): seção desligada sai das
 *   caixas e as posições da região se reorganizam (decisão de 2026-10-11).
 *   As cosméticas contam sempre e ficam intercaladas na espécie, sem caixas
 *   próprias.
 *
 * Conferido em 2026-10-12 contra o dataset: as 1.387 vagas em comum estão
 * na mesma ordem e nas mesmas quebras de região, com três diferenças
 * conhecidas — o SuperEffective põe o Vivillon Icy Snow antes do Meadow, as
 * cores de Flabébé/Floette/Florges em ordem alfabética (num outro arranjo
 * dele, na ordem do jogo, que é a daqui), e reserva uma caixa vazia no fim
 * de Sinnoh e de Unova. As 4 vagas que ele não tem (Greninja Battle Bond,
 * Rockruff Own Tempo, Zygarde 10% e 50% Power Construct) vêm da
 * classificação (`dex-classificacao.ts`).
 *
 * Caixa e posição são calculadas, não gravadas: dependem da trilha e das
 * seções ligadas.
 */
import { contaNaTrilha, type FormaParaGrade, type TrilhaDex } from "./dex-grade";
import type { SecoesContadas } from "./dex-secoes";
import { REGIOES, regiaoDoNumero, type Regiao } from "./escopo-pokedex";

export const VAGAS_POR_CAIXA = 30;
export const COLUNAS_CAIXA = 6;

export type FormaParaCaixa = Pick<FormaParaGrade, "numero" | "categoria" | "shinyObtenivel"> & { id: string; ordem: number };

export interface CaixaDex<T extends FormaParaCaixa> {
  /** 1, 2, 3… — a caixa no HOME. */
  numero: number;
  regiao: Regiao;
  /** 1, 2… dentro da região: o nome sugerido é "Kanto 2". */
  indiceNaRegiao: number;
  /** Até 30, na ordem das posições; a última caixa da região pode sobrar. */
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
): CaixaDex<T>[] {
  const porRegiao = new Map<Regiao, T[]>();
  const ordenadas = formas.filter((f) => contaNaTrilha(f, trilha, secoes)).sort((a, b) => a.ordem - b.ordem);
  for (const f of ordenadas) {
    const regiao = regiaoDoNumero(f.numero);
    const lista = porRegiao.get(regiao);
    if (lista) lista.push(f);
    else porRegiao.set(regiao, [f]);
  }

  const caixas: CaixaDex<T>[] = [];
  for (const regiao of REGIOES) {
    const vagas = porRegiao.get(regiao) ?? [];
    for (let i = 0; i < vagas.length; i += VAGAS_POR_CAIXA) {
      caixas.push({
        numero: caixas.length + 1,
        regiao,
        indiceNaRegiao: i / VAGAS_POR_CAIXA + 1,
        vagas: vagas.slice(i, i + VAGAS_POR_CAIXA),
      });
    }
  }
  return caixas;
}

/** Caixa e posição de cada vaga que está nas caixas, pelo id da vaga. */
export function posicoesNasCaixas(caixas: readonly CaixaDex<FormaParaCaixa>[]): Map<string, PosicaoNaCaixa> {
  const r = new Map<string, PosicaoNaCaixa>();
  for (const c of caixas) c.vagas.forEach((f, i) => r.set(f.id, { caixa: c.numero, posicao: i + 1 }));
  return r;
}
