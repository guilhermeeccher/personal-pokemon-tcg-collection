/**
 * Marcar compra arrastando o dedo por cima das cartas — a geometria do
 * gesto, pura (regras 2 e 3 de `docs/design-v2/rules.md`).
 *
 * - **Só no eixo horizontal.** O vertical é da rolagem da página: a grade
 *   tem `touch-action: pan-y`, então o navegador rola sozinho quando o dedo
 *   desce, e o gesto que começou mais vertical do que horizontal é largado
 *   aqui também (com o mouse, que não rola, a regra é a mesma). Para marcar
 *   uma coluna, toque carta a carta ou use o atalho.
 * - **Começa depois de 8 px.** Abaixo disso é um toque, que o clique trata.
 * - **Nunca perto da borda esquerda.** Os primeiros ~20 px são do "voltar"
 *   do Safari; um gesto que nasce ali não pinta (24 px, a mesma folga da
 *   virada de página do fichário).
 * - **Uma linha só.** Enquanto pinta, o ponto é lido na altura em que o
 *   gesto começou (`indiceNoPonto(x, y0)`): o dedo que escorrega para cima ou
 *   para baixo continua na mesma fileira, e nada de outra fileira entra sem
 *   o usuário ver. Um dedo rápido que pula células pinta as do meio também.
 * - **Um sentido só**, o da primeira carta: se ela estava fora da lista, o
 *   gesto põe; se estava dentro, tira (`acaoDoArrasto`).
 */

/** Quanto o dedo anda antes de virar arrasto (px). */
export const LIMIAR_ARRASTO = 8;
/** A faixa da borda esquerda onde nenhum gesto horizontal começa (px). */
export const BORDA_ESQUERDA = 24;

export type EstadoArrasto =
  | { fase: "pronto"; x0: number; y0: number; indice0: number; marcando: boolean }
  | { fase: "pintando"; y0: number; ultimo: number; marcando: boolean }
  /** O gesto virou rolagem: nada mais pinta até soltar. */
  | { fase: "rolagem" };

/** Começa um gesto sobre a carta `indice`; nulo quando ele nasce na borda do "voltar". */
export function iniciarArrasto(x: number, y: number, indice: number, marcando: boolean): EstadoArrasto | null {
  if (x < BORDA_ESQUERDA) return null;
  return { fase: "pronto", x0: x, y0: y, indice0: indice, marcando };
}

/**
 * Um movimento do ponteiro. Devolve o estado novo e os índices que ele pinta
 * agora, na ordem do percurso (a primeira carta entra quando o arrasto
 * começa).
 */
export function moverArrasto(
  estado: EstadoArrasto,
  x: number,
  y: number,
  indiceNoPonto: (x: number, y: number) => number | null,
): { estado: EstadoArrasto; novos: number[] } {
  if (estado.fase === "rolagem") return { estado, novos: [] };

  if (estado.fase === "pronto") {
    const dx = x - estado.x0;
    const dy = y - estado.y0;
    if (Math.hypot(dx, dy) < LIMIAR_ARRASTO) return { estado, novos: [] };
    if (Math.abs(dy) >= Math.abs(dx)) return { estado: { fase: "rolagem" }, novos: [] };
    const pintando: EstadoArrasto = { fase: "pintando", y0: estado.y0, ultimo: estado.indice0, marcando: estado.marcando };
    const depois = moverArrasto(pintando, x, y, indiceNoPonto);
    return { estado: depois.estado, novos: [estado.indice0, ...depois.novos] };
  }

  const indice = indiceNoPonto(x, estado.y0);
  // No vão entre duas cartas, ou fora da grade: nada muda até achar outra.
  if (indice === null || indice === estado.ultimo) return { estado, novos: [] };
  return { estado: { ...estado, ultimo: indice }, novos: faixaAte(estado.ultimo, indice) };
}

/** Os índices depois de `de` até `ate`, inclusive, no sentido do movimento. */
function faixaAte(de: number, ate: number): number[] {
  const passo = ate > de ? 1 : -1;
  const saida: number[] = [];
  for (let i = de + passo; passo > 0 ? i <= ate : i >= ate; i += passo) saida.push(i);
  return saida;
}
