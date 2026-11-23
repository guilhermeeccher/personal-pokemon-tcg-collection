"use client";

/**
 * Um único laço de `requestAnimationFrame` para todas as cartas que se
 * mexem, como no protótipo: cada carta ativa entra num conjunto, o laço
 * chama cada uma por quadro, e a que assentou sai. Com o conjunto vazio o
 * laço **para** — nenhum quadro é pedido com tudo parado, e nada roda com
 * a carta em repouso.
 *
 * Um laço por carta multiplicaria os callbacks por quadro e desencontraria
 * as escritas no DOM; um laço sempre ligado gastaria bateria à toa. Quem
 * decide se a carta pode se mexer (movimento reduzido, modo leve) é a
 * carta, antes de entrar aqui: este módulo só anda o tempo.
 */

import { PASSO_REFERENCIA_MS } from "./mola";

export interface Animador {
  /**
   * Um quadro. `dtMs` é o tempo desde o quadro anterior (o primeiro
   * quadro de um laço recebe o passo de referência). Devolve `false`
   * quando a carta assentou e sai do laço.
   */
  quadro(tempoMs: number, dtMs: number): boolean;
}

/* Quadro mais longo que isto (aba que voltou do fundo, depurador) conta
   como este: a mola só anda menos, em vez de pular. */
const MAX_DT_MS = 64;

const ativos = new Set<Animador>();
let pedido: number | null = null;
let anterior: number | null = null;

function quadro(tempo: number) {
  const dt = anterior === null ? PASSO_REFERENCIA_MS : Math.min(tempo - anterior, MAX_DT_MS);
  anterior = tempo;
  for (const animador of Array.from(ativos)) {
    if (!animador.quadro(tempo, dt)) ativos.delete(animador);
  }
  if (ativos.size > 0) {
    pedido = requestAnimationFrame(quadro);
  } else {
    pedido = null;
    anterior = null;
  }
}

/** Põe a carta no laço (ou a mantém) e liga o laço se estava parado. */
export function acordar(animador: Animador): void {
  ativos.add(animador);
  if (pedido === null) {
    anterior = null;
    pedido = requestAnimationFrame(quadro);
  }
}

/** Tira a carta do laço sem esperar ela assentar (desmontou, movimento desligou). */
export function dispensar(animador: Animador): void {
  ativos.delete(animador);
  if (ativos.size === 0 && pedido !== null) {
    cancelAnimationFrame(pedido);
    pedido = null;
    anterior = null;
  }
}
