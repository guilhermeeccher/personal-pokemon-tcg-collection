/**
 * A conta de uma caixa do HOME na grade virtual (`GradeVirtual`, regra 13 de
 * `docs/design-v2/rules.md`). Módulo puro: medidas entram, medidas saem.
 *
 * ## Por que existe
 *
 * Uma tela de caixas passa de 2.000 vagas (a trilha normal chega à caixa 70),
 * e cada vaga é botão, sprite e número: montadas todas, são ~8.000 nós e o
 * toque passa de 100 ms, fora do orçamento da regra 13. A grade virtual monta
 * só as caixas à vista, e para isso precisa saber a altura de uma caixa sem
 * montá-la. A caixa tem largura `W` (a célula da grade) e 6 × 5 vagas
 * quadradas, então a altura é uma função afim da largura:
 *
 *     lado   = (W − 2·p − 5·v) / 6
 *     altura = cabeçalho + 2·p + 5·lado + 4·v
 *            = (5/6)·W + cabeçalho + p/3 − v/6
 *
 * `PROPORCAO_CAIXA` e `ALTURA_EXTRA_CAIXA` são esses dois termos, no formato
 * que a grade pede (`proporcao` e `alturaExtra`). O CSS da caixa
 * (`caixas.module.css`) usa as mesmas constantes (`--cx-respiro`, `--cx-vao`,
 * `--cx-cabecalho`); mudar uma sem a outra corta a última fileira ou deixa um
 * vazio, e o teste confere a conta.
 */
import { COLUNAS_CAIXA, VAGAS_POR_CAIXA } from "@/lib/dominio/dex-caixas";

/** Respiro entre a borda da caixa e as vagas, em px. */
export const RESPIRO_CAIXA = 8;
/** Vão entre vagas, em px. Fixo em toda largura: a altura da caixa depende dele. */
export const VAO_CAIXA = 4;
/** Altura do cabeçalho (nome e faixa numa linha só, com reticências), em px. */
export const ALTURA_CABECALHO_CAIXA = 44;

export const LINHAS_CAIXA = VAGAS_POR_CAIXA / COLUNAS_CAIXA;

/** Altura ÷ largura da parte que cresce com a largura: as cinco fileiras, de 5/6 da largura. */
export const PROPORCAO_CAIXA = LINHAS_CAIXA / COLUNAS_CAIXA;

/** O resto da altura, que não depende da largura. */
export const ALTURA_EXTRA_CAIXA =
  ALTURA_CABECALHO_CAIXA +
  2 * RESPIRO_CAIXA +
  (LINHAS_CAIXA - 1) * VAO_CAIXA -
  PROPORCAO_CAIXA * (2 * RESPIRO_CAIXA + (COLUNAS_CAIXA - 1) * VAO_CAIXA);

/**
 * Quantas caixas a grade monta inteiras antes de virtualizar: 10 caixas são
 * 300 vagas, o mesmo limiar da regra 13 em vagas. Abaixo disso (uma região
 * pequena, uma trilha quase vazia) a tela é uma árvore só.
 */
export const LIMIAR_CAIXAS = 10;

/** A menor largura de caixa: seis vagas de 44 px pedem 6·44 + 5·4 + 2·8 = 300 px. */
export const MIN_CAIXA = 300;

/** O lado de uma vaga numa caixa de largura `larguraCaixa`. */
export function ladoDaVaga(larguraCaixa: number): number {
  return (larguraCaixa - 2 * RESPIRO_CAIXA - (COLUNAS_CAIXA - 1) * VAO_CAIXA) / COLUNAS_CAIXA;
}

/** A altura de uma caixa de largura `larguraCaixa`, pelas medidas do desenho (não pela fórmula afim). */
export function alturaDaCaixa(larguraCaixa: number): number {
  return (
    ALTURA_CABECALHO_CAIXA +
    2 * RESPIRO_CAIXA +
    LINHAS_CAIXA * ladoDaVaga(larguraCaixa) +
    (LINHAS_CAIXA - 1) * VAO_CAIXA
  );
}
