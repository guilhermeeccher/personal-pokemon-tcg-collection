"use client";

/**
 * Cartão que abre ao parar o mouse num sprite: o render grande do HOME, o
 * nome e as linhas que a tela quiser (estado, caixa e posição). Um cartão por
 * tela, posicionado ao lado do sprite: o render (~80 KB) só é baixado de quem
 * o usuário parou em cima, nunca de uma caixa inteira.
 *
 * Só em aparelho com mouse (`hover: hover`): no toque, o toque continua
 * levando ao cadastro, e nada abre por cima.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { urlRenderHomeDex } from "@/lib/imagens";

const ESPERA_MS = 250;
const LARGURA = 224;

export interface DadosCartaoPokemon {
  sprite: string;
  shiny: boolean;
  nome: string;
  linhas: string[];
}

export function useCartaoPokemon() {
  const [alvo, setAlvo] = useState<(DadosCartaoPokemon & { rect: DOMRect }) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const fechar = useCallback(() => {
    window.clearTimeout(timer.current);
    setAlvo(null);
  }, []);

  const abrir = useCallback(
    (dados: DadosCartaoPokemon) => (e: MouseEvent<HTMLElement>) => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      const rect = e.currentTarget.getBoundingClientRect();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAlvo({ ...dados, rect }), ESPERA_MS);
    },
    [],
  );

  // Rolar a página tira o cartão do lugar: fecha.
  useEffect(() => {
    if (!alvo) return;
    window.addEventListener("scroll", fechar, { passive: true, once: true });
    return () => window.removeEventListener("scroll", fechar);
  }, [alvo, fechar]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cartao = alvo ? <CartaoFlutuante {...alvo} /> : null;
  return { abrir, fechar, cartao };
}

function CartaoFlutuante({ sprite, shiny, nome, linhas, rect }: DadosCartaoPokemon & { rect: DOMRect }) {
  const cabeDireita = rect.right + 12 + LARGURA < window.innerWidth;
  const left = cabeDireita ? rect.right + 12 : Math.max(8, rect.left - 12 - LARGURA);
  const top = Math.min(Math.max(8, rect.top + rect.height / 2 - 150), window.innerHeight - 320);
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 flex flex-col items-center gap-1 rounded-card border border-hairline bg-surface p-3 text-center shadow-3 animate-[surgir_150ms_ease-out] motion-reduce:animate-none"
      style={{ left, top, width: LARGURA }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), um por vez, só de quem o usuário parou em cima. */}
      <img src={urlRenderHomeDex(sprite, shiny)} alt="" width={180} height={180} className="h-[180px] w-[180px] object-contain" />
      <span className="font-display text-base font-bold text-strong">{nome}</span>
      {linhas.map((l) => (
        <span key={l} className="text-xs text-muted">
          {l}
        </span>
      ))}
    </div>
  );
}
