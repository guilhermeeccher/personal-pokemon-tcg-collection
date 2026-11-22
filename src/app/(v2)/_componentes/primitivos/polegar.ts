/**
 * O polegar líquido do segmentado e da barra de abas: a pílula clara que
 * fica sob a opção escolhida e, ao trocar, escorre até a nova, esticando no
 * meio do caminho e assentando com um leve passo além.
 *
 * Aqui só a geometria, pura: dada a posição de antes e a de depois, os quadros
 * da animação. Quem mede o DOM e chama `element.animate` é `use-polegar.ts`.
 * O protótipo fazia a conta e a animação juntas, lendo o movimento reduzido
 * uma vez só, na carga; aqui a decisão de animar vem de fora, a cada troca.
 */

export interface PosicaoPolegar {
  /** Deslocamento da borda esquerda, em px, relativo ao contêiner. */
  x: number;
  /** Largura, em px. */
  largura: number;
}

export interface QuadroPolegar {
  transform: string;
  width: string;
  offset?: number;
}

/** Quanto o polegar estica no meio do caminho, em fração da distância. */
export const ESTICAMENTO = 0.35;
/** Passo além do destino no assentamento, em px. */
export const PASSO_ALEM = 3;
export const DURACAO_POLEGAR_MS = 560;
export const CURVA_POLEGAR = "cubic-bezier(.3,.7,.2,1)";

function px(n: number): string {
  // Arredonda a centésimos: medidas do DOM vêm com frações longas e o
  // estilo não ganha nada com elas.
  return `${Math.round(n * 100) / 100}px`;
}

/** O estilo do polegar parado numa posição. */
export function estiloPolegar(p: PosicaoPolegar): { transform: string; width: string } {
  return { transform: `translateX(${px(p.x)})`, width: px(p.largura) };
}

/**
 * Os quadros de `antes` até `depois`, ou `null` quando não há o que animar
 * (mesma posição, ou primeira medição — o polegar só aparece no lugar).
 *
 * No meio (45%) o polegar cobre as duas posições como uma gota esticada: a
 * largura cresce com a distância e ele achata um pouco (`scaleY(.9)`); aos
 * 80% passa `PASSO_ALEM` px do destino na direção do movimento e volta.
 */
export function quadrosDoPolegar(antes: PosicaoPolegar | null, depois: PosicaoPolegar): QuadroPolegar[] | null {
  if (!antes) return null;
  const distancia = depois.x - antes.x;
  if (distancia === 0 && antes.largura === depois.largura) return null;

  const esticado = Math.max(depois.largura, antes.largura) + Math.abs(distancia) * ESTICAMENTO;
  const centroMeio = (antes.x + antes.largura / 2 + depois.x + depois.largura / 2) / 2;
  const passo = Math.sign(distancia) * PASSO_ALEM;

  return [
    { transform: `translateX(${px(antes.x)})`, width: px(antes.largura) },
    { transform: `translateX(${px(centroMeio - esticado / 2)}) scaleY(.9)`, width: px(esticado), offset: 0.45 },
    { transform: `translateX(${px(depois.x + passo)})`, width: px(depois.largura), offset: 0.8 },
    { transform: `translateX(${px(depois.x)})`, width: px(depois.largura) },
  ];
}
