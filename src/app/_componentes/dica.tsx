"use client";

/**
 * Dica — o `title` que o celular não tem, em forma de toggletip.
 *
 * No desktop, selos como a condição (`Near Mint`) e a raridade explicam-se
 * pelo `title` do próprio elemento. No toque não existe passar o mouse, então
 * a explicação some. A `Dica` devolve essa explicação sem esconder nada atrás
 * de um gesto invisível: ao lado do filho aparece um botão "i" que o usuário
 * enxerga, e o toque nele abre e fecha um balão.
 *
 * ## Larguras
 *
 * - **768px ou mais:** devolve o filho exatamente como veio. O `title`
 *   continua sendo do próprio filho, e o desktop sai idêntico (mesmo DOM).
 * - **Abaixo de 768px:** filho + botão "i" + balão.
 *
 * ## Onde NÃO usar
 *
 * **Nunca dentro de `label`, `a` ou `button`.** O botão "i" é um controle;
 * aninhá-lo num outro controle é HTML inválido e faz o toque acionar o pai
 * (marcar a caixa, seguir o link). Onde o selo está dentro de um controle,
 * o dono da tela mostra o texto visível no lugar do balão.
 *
 * ## Como o balão se comporta
 *
 * - Renderizado num portal em `document.body` com `position: fixed`, posição
 *   calculada a partir do botão: assim não é cortado pelo `overflow` de uma
 *   janela rolável nem de uma tabela. Fica acima do zoom de carta (`z-60`).
 * - Fecha ao tocar fora, ao tocar no botão de novo, com Esc (via
 *   `useCamada`, nível `balao`) e ao rolar a página ou girar o aparelho — a
 *   posição é calculada uma vez, e um balão solto do lugar de onde saiu é
 *   pior que um balão que fecha.
 * - **Não é modal e não prende foco.** Aberto dentro de uma janela, quem
 *   continua prendendo o Tab é a janela (`ehModalDoTopo`, em `use-camada.ts`).
 * - Só um aberto por vez: o toque fora de um é o toque que fecha o anterior.
 * - O texto também vai para uma região `role="status"` sempre presente: um
 *   leitor de tela só anuncia a mudança numa região que já estava na página,
 *   não numa que nasce com o texto dentro.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useCamada } from "./use-camada";
import { useEhMobile } from "./use-eh-mobile";

const MARGEM_PX = 12;
const DISTANCIA_PX = 8;
const LARGURA_MAXIMA_PX = 288;

interface PosicaoBalao {
  top?: number;
  bottom?: number;
  left: number;
  largura: number;
}

/**
 * Prefere abrir abaixo do botão (o dedo que tocou não cobre o texto); sem
 * espaço, abre acima. Sempre dentro da tela, com margem.
 */
function calcularPosicao(rect: DOMRect): PosicaoBalao {
  const larguraTela = window.innerWidth;
  const alturaTela = window.innerHeight;
  const largura = Math.min(LARGURA_MAXIMA_PX, larguraTela - 2 * MARGEM_PX);
  const centro = rect.left + rect.width / 2;
  const left = Math.min(Math.max(centro - largura / 2, MARGEM_PX), larguraTela - largura - MARGEM_PX);
  // Estimativa grosseira do que "cabe abaixo": o balão tem poucas linhas.
  const espacoAbaixo = alturaTela - rect.bottom;
  if (espacoAbaixo >= 120) return { top: rect.bottom + DISTANCIA_PX, left, largura };
  return { bottom: alturaTela - rect.top + DISTANCIA_PX, left, largura };
}

export function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  const mobile = useEhMobile();
  if (!mobile) return <>{children}</>;
  return <DicaMobile texto={texto}>{children}</DicaMobile>;
}

function DicaMobile({ texto, children }: { texto: string; children: ReactNode }) {
  const t = useTranslations("componentes");
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<PosicaoBalao | null>(null);
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const balaoRef = useRef<HTMLDivElement | null>(null);

  const fechar = useCallback(() => setAberto(false), []);
  useCamada(aberto, { nivel: "balao", onEsc: fechar });

  function alternar() {
    if (aberto) {
      setAberto(false);
      return;
    }
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao(calcularPosicao(rect));
    setAberto(true);
  }

  // Toque fora fecha. `pointerdown` e em captura: fecha antes de o toque
  // chegar ao que estiver por baixo, e vale também para uma rolagem que
  // começa fora do balão.
  useEffect(() => {
    if (!aberto) return;
    function aoTocar(e: PointerEvent) {
      const alvo = e.target as Node | null;
      if (alvo && (botaoRef.current?.contains(alvo) || balaoRef.current?.contains(alvo))) return;
      setAberto(false);
    }
    const fecharAoMover = () => setAberto(false);
    document.addEventListener("pointerdown", aoTocar, true);
    window.addEventListener("scroll", fecharAoMover, { capture: true, passive: true });
    window.addEventListener("resize", fecharAoMover);
    return () => {
      document.removeEventListener("pointerdown", aoTocar, true);
      window.removeEventListener("scroll", fecharAoMover, true);
      window.removeEventListener("resize", fecharAoMover);
    };
  }, [aberto]);

  return (
    // `min-h-11`: a área de 44px do botão passa 12px acima e abaixo do desenho;
    // com o invólucro na altura dela, uma linha de selos que quebra não põe a
    // área de uma Dica em cima da da linha de baixo (o intervalo entre linhas,
    // de 8px, fica por conta de quem usa).
    <span className="inline-flex min-h-11 items-center gap-1">
      {children}
      <button
        ref={botaoRef}
        type="button"
        onClick={(e) => {
          // A Dica pode estar numa linha clicável: abrir o balão não pode
          // disparar a ação da linha.
          e.stopPropagation();
          alternar();
        }}
        aria-label={t("mobile.maisInformacoes")}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        aria-describedby={aberto ? id : undefined}
        // Desenho de 20px com área de toque de 44 pelo pseudo-elemento. O
        // espaço dessa área é reservado no layout: na altura, pelo `min-h-11`
        // do invólucro; na largura, à direita, pelo `mr-3` abaixo.
        // `mr-3`: a área de 44px passa 12px de cada lado do desenho de 20px; à
        // direita, esses 12px ficam reservados no layout, e o intervalo que o
        // consumidor já põe entre controles (8px) sobra inteiro depois deles.
        className="relative mr-3 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-[11px] font-semibold leading-none text-muted after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
      >
        i
      </button>
      <span role="status" className="sr-only">
        {aberto ? texto : ""}
      </span>
      {aberto && posicao && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={balaoRef}
              id={id}
              role="tooltip"
              // O portal sobe pela árvore do React: sem isto, um toque no
              // balão chegaria ao `onClick` da linha ou da janela de baixo.
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: posicao.top,
                bottom: posicao.bottom,
                left: posicao.left,
                width: posicao.largura,
              }}
              className="z-60 rounded-lg border border-line bg-surface-elevated px-3 py-2 text-sm text-foreground shadow-xl"
            >
              {texto}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
