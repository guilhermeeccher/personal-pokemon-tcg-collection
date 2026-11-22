"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import { CURVA_POLEGAR, DURACAO_POLEGAR_MS, type PosicaoPolegar, estiloPolegar, quadrosDoPolegar } from "./polegar";

/** O item sob o polegar se marca com este atributo. */
export const ATRIBUTO_POLEGAR = "data-polegar-ativo";

const CONSULTA_REDUZIDO = "(prefers-reduced-motion: reduce)";

/**
 * Põe o polegar (`polegar`) sob o item marcado com `data-polegar-ativo`
 * dentro de `contenedor`, e o escorre até o novo quando `chave` muda.
 *
 * - O movimento reduzido é lido **a cada troca**, não na montagem: quem liga
 *   a opção com a página aberta deixa de ver o polegar escorrer na hora.
 * - Mudança de tamanho (fonte que carregou, aparelho girado, rótulo
 *   traduzido) só reposiciona, sem animar.
 * - Sem item ativo, o polegar some.
 *
 * Os dois elementos são do chamador; o contêiner precisa ser
 * `position: relative` (o `offsetLeft` é medido a partir dele).
 */
export function usePolegar(
  contenedor: RefObject<HTMLElement | null>,
  polegar: RefObject<HTMLElement | null>,
  chave: string | null,
): void {
  const anterior = useRef<PosicaoPolegar | null>(null);

  // Antes da pintura, para o polegar nunca aparecer um quadro no lugar velho.
  useLayoutEffect(() => {
    posicionar(contenedor.current, polegar.current, anterior, true);
  }, [chave, contenedor, polegar]);

  useEffect(() => {
    const cont = contenedor.current;
    if (!cont || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => posicionar(contenedor.current, polegar.current, anterior, false));
    observador.observe(cont);
    for (const filho of Array.from(cont.children)) observador.observe(filho);
    return () => observador.disconnect();
  }, [contenedor, polegar]);
}

/* Fora do hook: mexe no estilo de um nó do DOM, o que não é estado do React. */
function posicionar(
  cont: HTMLElement | null,
  pol: HTMLElement | null,
  anterior: { current: PosicaoPolegar | null },
  animar: boolean,
): void {
  if (!cont || !pol) return;
  const ativo = cont.querySelector<HTMLElement>(`[${ATRIBUTO_POLEGAR}="true"]`);
  if (!ativo) {
    pol.style.opacity = "0";
    anterior.current = null;
    return;
  }
  const depois: PosicaoPolegar = { x: ativo.offsetLeft, largura: ativo.offsetWidth };
  pol.style.opacity = "1";
  Object.assign(pol.style, estiloPolegar(depois));
  const reduzido = window.matchMedia(CONSULTA_REDUZIDO).matches;
  const quadros = animar && !reduzido ? quadrosDoPolegar(anterior.current, depois) : null;
  anterior.current = depois;
  if (quadros && typeof pol.animate === "function") {
    pol.animate(
      quadros.map((q) => ({ ...q })),
      { duration: DURACAO_POLEGAR_MS, easing: CURVA_POLEGAR },
    );
  }
}
