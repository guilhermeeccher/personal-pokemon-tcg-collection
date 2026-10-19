"use client";

/**
 * `useEhMobile()` — verdadeiro abaixo de 768px, a mesma fronteira `md` em que
 * o shell troca a lombada pelo cabeçalho com menu (`layout.tsx`).
 *
 * ## Por que largura, e não "é toque"
 *
 * Todo ajuste de celular deste app vale só abaixo do `md`, e o desktop (768px
 * para cima) tem de sair idêntico — inclusive notebook com tela de toque e
 * iPad em retrato. Capacidade de toque (`hover: none`, `pointer: coarse`)
 * pegaria esses aparelhos e mudaria o desktop deles; por isso ela nunca decide
 * sozinha. Quem precisa dela combina com este hook.
 *
 * ## Por que começa em `false`
 *
 * No servidor não existe largura de tela. Começar em `false` faz a hidratação
 * do cliente sair igual ao HTML do servidor — que é o do desktop — e o ajuste
 * de celular entra logo depois. (Um componente montado só no cliente, depois
 * da hidratação, já nasce com o valor real.) O preço é
 * um quadro com o markup de desktop no celular; o que vem a ser trocado por
 * aqui é comportamento e atributo (stepper, `inputMode`, foco do sheet),
 * porque o desenho do celular é CSS (`max-md:`) e já chega certo no primeiro
 * quadro.
 */

import { useSyncExternalStore } from "react";

const CONSULTA = "(width < 48rem)";

function assinar(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

export function useEhMobile(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
