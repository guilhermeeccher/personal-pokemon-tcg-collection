"use client";

/**
 * `<TransicaoVista>` — o `<ViewTransition>` do React com o movimento da v2
 * aplicado. **Toda View Transition da v2 passa por aqui.**
 *
 * ## Regras (decisão de 2026-11-22)
 *
 * - **Só pelo React.** O `<ViewTransition>` vem no React canary que o Next
 *   16.3.2 embute, sem flag (a `experimental.viewTransition` deixou de
 *   existir no 16.3; não a acrescente ao `next.config.ts`). Chamar a API do
 *   documento à mão ao lado dele faz o React interromper a transição que
 *   estiver rodando — uma transição por vez, e é o React quem as coordena.
 *   `regras-movimento.test.ts` falha se a chamada direta aparecer em
 *   `src/app/(v2)`.
 * - **Só anima o que muda dentro de uma Transition** (`startTransition`,
 *   `useDeferredValue`, `<Suspense>`, navegação do Next). Um `setState`
 *   comum troca o conteúdo na hora, sem animação.
 * - **Movimento reduzido desliga.** Com `transicoes` falso, o componente
 *   continua montado e só recebe `"none"` em todas as condições: trocar o
 *   invólucro por um fragmento mudaria a árvore e remontaria os filhos,
 *   perdendo estado. O destino é o mesmo, sem o caminho.
 * - **Nome compartilhado só no par ativo** (`nomeTransicaoCarta`).
 *
 * Os tipos vêm de `react-canary.d.ts`, nesta pasta.
 */

import { ViewTransition, type ViewTransitionProps } from "react";

import { useMovimento } from "./use-movimento";

export function TransicaoVista(props: ViewTransitionProps) {
  const { transicoes } = useMovimento();
  if (transicoes) return <ViewTransition {...props} />;
  return <ViewTransition {...props} default="none" enter="none" exit="none" share="none" update="none" />;
}
