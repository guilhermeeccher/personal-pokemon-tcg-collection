"use client";

/**
 * `useCamada(ativa, opcoes)` — registra uma camada sobreposta (janela do
 * `Modal`, zoom de carta, balão de `Dica`) numa pilha única da página.
 *
 * Três coisas que cada camada fazia sozinha e que, sozinhas, brigam quando uma
 * abre por cima da outra (zoom de carta dentro da janela de editar cópia, por
 * exemplo):
 *
 * - **Quem está no topo.** Decidido pelo `nivel` da camada (janela < zoom <
 *   balão, a mesma ordem do z-index), e só entre camadas do mesmo nível pela
 *   ordem de abertura. Não pela ordem em que os efeitos do React rodam: ao
 *   girar o aparelho, uma janela e um zoom podem se registrar de novo em
 *   qualquer ordem, e a janela, que está atrás, não pode passar a receber o Esc.
 * - **Esc fecha só a camada do topo.**
 * - **Trava da rolagem do fundo, por contagem**, e só no celular. A página só
 *   volta a rolar quando a ÚLTIMA camada que pediu trava fecha — fechar o zoom
 *   não destrava o fundo de uma janela que continua aberta.
 *
 * - **Quem cuida do foco.** São duas perguntas diferentes: o Esc vai para a
 *   camada do topo, seja ela qual for; o foco preso é da camada MODAL mais alta
 *   (janela ou zoom). O balão da `Dica` não é modal: aberto dentro de uma
 *   janela, ele recebe o Esc, mas quem continua prendendo o Tab é a janela —
 *   senão o foco escaparia dela enquanto o balão estivesse aberto.
 *   `ehTopo()` responde à primeira pergunta, `ehModalDoTopo()` à segunda; as
 *   duas são funções, consultadas na hora do evento. Cada camada modal prende o
 *   próprio foco e o devolve ao fechar (ver `modal.tsx` e `imagem-carta-zoom.tsx`).
 *
 * ## Larguras
 *
 * A pilha e o Esc valem em qualquer largura: a janela do `Modal` fecha com Esc
 * também no desktop (decisão de 2026-10-18). O zoom por toque e o balão da
 * `Dica` só existem abaixo de 768px, e quem os chama passa `ativa` já combinada
 * com `useEhMobile()`. A trava de rolagem também só abaixo de 768px: no
 * desktop o `body` não rola (o conteúdo rola dentro do painel, `layout.tsx`).
 *
 * ## Como trava a rolagem no Safari do iPhone
 *
 * `overflow: hidden` no `body` não basta no iOS: a página continua rolando
 * por trás da janela com o dedo. O jeito que funciona é fixar o `body` no
 * lugar (`position: fixed` com `top` negativo igual à rolagem atual) e, ao
 * destravar, devolver os estilos que ele tinha e a rolagem para onde estava —
 * sem isso o usuário volta para o topo da lista ao fechar a janela.
 */

import { useCallback, useEffect, useId, useState } from "react";

export type NivelCamada = "janela" | "zoom" | "balao";

const PESO: Record<NivelCamada, number> = { janela: 1, zoom: 2, balao: 3 };
const MODAL: Record<NivelCamada, boolean> = { janela: true, zoom: true, balao: false };

type Camada = { id: string; nivel: NivelCamada; ordem: number; travaRolagem: boolean; onEsc?: () => void };

const pilha: Camada[] = [];
let contador = 0;
let travaAtiva = false;
let rolagemGuardada = 0;
let estilosGuardados: Pick<CSSStyleDeclaration, "position" | "top" | "left" | "right"> | null = null;

function topo(filtro: (c: Camada) => boolean = () => true): Camada | undefined {
  let melhor: Camada | undefined;
  for (const c of pilha.filter(filtro)) {
    if (!melhor || PESO[c.nivel] > PESO[melhor.nivel] || (PESO[c.nivel] === PESO[melhor.nivel] && c.ordem > melhor.ordem)) {
      melhor = c;
    }
  }
  return melhor;
}

function atualizarTrava() {
  const precisa = pilha.some((c) => c.travaRolagem);
  if (precisa === travaAtiva) return;
  const corpo = document.body.style;
  if (precisa) {
    rolagemGuardada = window.scrollY;
    estilosGuardados = { position: corpo.position, top: corpo.top, left: corpo.left, right: corpo.right };
    corpo.position = "fixed";
    corpo.top = `-${rolagemGuardada}px`;
    corpo.left = "0";
    corpo.right = "0";
  } else {
    if (estilosGuardados) Object.assign(corpo, estilosGuardados);
    estilosGuardados = null;
    window.scrollTo(0, rolagemGuardada);
  }
  travaAtiva = precisa;
}

function aoTeclar(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const t = topo();
  if (t?.onEsc) {
    e.preventDefault();
    t.onEsc();
  }
}

export function useCamada(
  ativa: boolean,
  {
    nivel,
    onEsc,
    travaRolagem = false,
  }: { nivel: NivelCamada; onEsc?: () => void; travaRolagem?: boolean },
): { ehTopo: () => boolean; ehModalDoTopo: () => boolean } {
  const id = useId();
  // Ordem de ABERTURA, registrada na renderização em que a camada passa a
  // ativa (e zerada quando fecha) — não no efeito e não na montagem. Na
  // renderização o React passa pelo pai antes do filho, então uma janela
  // aberta junto com outra de dentro dela fica sempre acima; e uma camada que
  // já estava montada (zoom, balão) entra no topo do seu nível ao abrir.
  // Ajuste de estado durante a renderização: o padrão do React para estado
  // que depende de uma prop.
  const [abertura, setAbertura] = useState({ ativa: false, ordem: 0 });
  if (abertura.ativa !== ativa) setAbertura({ ativa, ordem: ativa ? ++contador : 0 });
  const ordem = abertura.ordem;

  // Entrar e sair da pilha só quando a camada abre ou fecha: mudar a trava ou
  // o Esc depois não reempilha (não mexe na ordem de abertura).
  useEffect(() => {
    if (!ativa) return;
    pilha.push({ id, nivel, ordem, travaRolagem: false });
    if (pilha.length === 1) document.addEventListener("keydown", aoTeclar);
    return () => {
      const i = pilha.findIndex((c) => c.id === id);
      if (i >= 0) pilha.splice(i, 1);
      if (pilha.length === 0) document.removeEventListener("keydown", aoTeclar);
      atualizarTrava();
    };
  }, [ativa, id, nivel, ordem]);

  useEffect(() => {
    const camada = pilha.find((c) => c.id === id);
    if (!camada) return;
    camada.travaRolagem = travaRolagem;
    camada.onEsc = onEsc;
    atualizarTrava();
  }, [ativa, id, nivel, travaRolagem, onEsc]);

  const ehTopo = useCallback(() => topo()?.id === id, [id]);
  const ehModalDoTopo = useCallback(() => topo((c) => MODAL[c.nivel])?.id === id, [id]);
  return { ehTopo, ehModalDoTopo };
}
