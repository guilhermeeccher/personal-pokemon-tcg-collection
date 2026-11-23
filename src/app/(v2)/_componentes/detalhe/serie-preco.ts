/**
 * A série curta de preço do detalhe, desenhada: o caminho da linha e da área
 * de um SVG pequeno, e o resumo em texto que o leitor de tela lê no lugar do
 * desenho. Módulo puro.
 *
 * - **O eixo x é o tempo**, não o índice: as rodadas não têm frequência fixa,
 *   e pontos igualmente espaçados desenhariam uma semana sem consulta como
 *   se fosse um dia.
 * - **O eixo y vai do menor ao maior da própria série**, com respiro: a
 *   série diz para onde o preço andou, não quanto ele vale (o número está
 *   escrito ao lado). Série reta fica no meio.
 * - **Uma fonte só** (a ativa): a leitura já entrega assim, e juntar Liga com
 *   Cardmarket desenharia uma queda que nunca aconteceu.
 * - **Menos de dois pontos não é linha**: nada a desenhar.
 */

export interface PontoSerie {
  em: string;
  valor: number;
}

export interface DesenhoSerie {
  linha: string;
  area: string;
  ultimo: { x: number; y: number };
}

function arred(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function desenharSerie(
  pontos: readonly PontoSerie[],
  largura: number,
  altura: number,
  respiro = 4,
): DesenhoSerie | null {
  if (pontos.length < 2) return null;
  const tempos = pontos.map((p) => Date.parse(p.em));
  const t0 = Math.min(...tempos);
  const t1 = Math.max(...tempos);
  const v0 = Math.min(...pontos.map((p) => p.valor));
  const v1 = Math.max(...pontos.map((p) => p.valor));
  const util = altura - 2 * respiro;

  const coords = pontos.map((p, i) => {
    // Todas no mesmo instante (não acontece na prática): cai para o índice.
    const fracaoX = t1 > t0 ? (tempos[i] - t0) / (t1 - t0) : i / (pontos.length - 1);
    const fracaoY = v1 > v0 ? (p.valor - v0) / (v1 - v0) : 0.5;
    return { x: fracaoX * largura, y: respiro + (1 - fracaoY) * util };
  });

  const linha = coords.map((c, i) => `${i === 0 ? "M" : "L"}${arred(c.x)} ${arred(c.y)}`).join(" ");
  const area = `${linha} L${arred(largura)} ${arred(altura)} L0 ${arred(altura)} Z`;
  const ultimo = coords[coords.length - 1];
  return { linha, area, ultimo: { x: ultimo.x, y: ultimo.y } };
}

export interface ResumoSerie {
  pontos: number;
  primeiro: PontoSerie;
  ultimo: PontoSerie;
  menor: number;
  maior: number;
}

/** O que o texto alternativo diz: de quando a quando, de quanto a quanto, mínimo e máximo. */
export function resumirSerie(pontos: readonly PontoSerie[]): ResumoSerie | null {
  if (pontos.length === 0) return null;
  const valores = pontos.map((p) => p.valor);
  return {
    pontos: pontos.length,
    primeiro: pontos[0],
    ultimo: pontos[pontos.length - 1],
    menor: Math.min(...valores),
    maior: Math.max(...valores),
  };
}
