"use client";

/**
 * `useCamada(ativa, opcoes)` — registra uma camada sobreposta (janela,
 * confirmação, folha "Mais", o detalhe de carta do pacote 1b, um balão) na
 * pilha única da página. As regras, e o que muda em relação à v1, estão em
 * `camadas.ts`; aqui o estado vivo.
 *
 * ## Como trava a rolagem
 *
 * `overflow: hidden` no `body` não basta no Safari do iPhone: a página
 * continua rolando com o dedo por trás da janela. O que funciona é fixar o
 * `body` no lugar (`position: fixed` com `top` negativo igual à rolagem) e,
 * ao destravar, devolver os estilos que ele tinha e a rolagem para onde
 * estava — sem isso a pessoa volta ao topo da lista ao fechar a janela. Na
 * v2 isso vale em qualquer largura; o `scrollbar-gutter: stable` de `v2.css`
 * impede que a barra de rolagem sumindo empurre a página no desktop.
 *
 * ## Foco
 *
 * Cada camada modal prende o próprio Tab (ver `modal.tsx`) e chama
 * `devolverFoco` ao fechar. O retorno roda num quadro depois da limpeza dos
 * efeitos, quando a trava já devolveu a rolagem: focar antes faria o
 * navegador rolar até um alvo que ainda está no lugar errado.
 */

import { useCallback, useEffect, useId, useState } from "react";

import {
  type CamadaRegistrada,
  type NivelCamada,
  NIVEL_MODAL,
  camadaDoTopo,
  escolherAlvoDeFoco,
  modalDoTopo,
  precisaTrava,
} from "./camadas";

export type { NivelCamada } from "./camadas";

/** O `id` do conteúdo principal da casca: o último recurso do foco. */
export const ID_CONTEUDO = "v2-conteudo";

/**
 * Acha o alvo do foco na hora de fechar. Pode ser assíncrono: uma grade
 * virtual rola até a célula, espera um quadro para ela montar e a devolve.
 */
export type ResolvedorFoco = () => HTMLElement | null | Promise<HTMLElement | null>;

type Camada = CamadaRegistrada & { onEsc?: () => void };

const pilha: Camada[] = [];

/*
 * O último elemento focado fora de qualquer camada (`[data-v2-camada]`). Só
 * serve quando a camada abre com um campo `autoFocus`, que toma o foco antes
 * de a janela saber quem a abriu. Escutado desde o primeiro uso do módulo.
 */
let ultimoFocoFora: HTMLElement | null = null;
let rastreando = false;
function rastrearFoco() {
  if (rastreando || typeof document === "undefined") return;
  rastreando = true;
  document.addEventListener("focusin", (e) => {
    const alvo = e.target;
    if (alvo instanceof HTMLElement && !alvo.closest("[data-v2-camada]")) ultimoFocoFora = alvo;
  });
}

export function ultimoFocoForaDasCamadas(): HTMLElement | null {
  return ultimoFocoFora;
}
let contador = 0;
let travaAtiva = false;
let rolagemGuardada = 0;
let estilosGuardados: Pick<CSSStyleDeclaration, "position" | "top" | "left" | "right" | "width"> | null = null;

function atualizarTrava() {
  const precisa = precisaTrava(pilha);
  if (precisa === travaAtiva) return;
  const corpo = document.body.style;
  if (precisa) {
    rolagemGuardada = window.scrollY;
    estilosGuardados = {
      position: corpo.position,
      top: corpo.top,
      left: corpo.left,
      right: corpo.right,
      width: corpo.width,
    };
    corpo.position = "fixed";
    corpo.top = `-${rolagemGuardada}px`;
    corpo.left = "0";
    corpo.right = "0";
    corpo.width = "100%";
  } else {
    if (estilosGuardados) Object.assign(corpo, estilosGuardados);
    estilosGuardados = null;
    window.scrollTo(0, rolagemGuardada);
  }
  travaAtiva = precisa;
}

function aoTeclar(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const topo = camadaDoTopo(pilha);
  if (topo?.onEsc) {
    e.preventDefault();
    topo.onEsc();
  }
}

export function useCamada(
  ativa: boolean,
  {
    nivel,
    onEsc,
    travaRolagem = NIVEL_MODAL[nivel],
  }: { nivel: NivelCamada; onEsc?: () => void; travaRolagem?: boolean },
): { ehTopo: () => boolean; ehModalDoTopo: () => boolean } {
  const id = useId();
  // Ordem de ABERTURA, registrada na renderização em que a camada passa a
  // ativa — não no efeito e não na montagem. Na renderização o React passa
  // pelo pai antes do filho, então uma confirmação aberta junto com a janela
  // de onde ela sai fica sempre acima. Ajuste de estado durante a
  // renderização: o padrão do React para estado que depende de uma prop.
  const [abertura, setAbertura] = useState({ ativa: false, ordem: 0 });
  if (abertura.ativa !== ativa) setAbertura({ ativa, ordem: ativa ? ++contador : 0 });
  const ordem = abertura.ordem;

  // Entrar e sair da pilha só quando a camada abre ou fecha: mudar a trava ou
  // o Esc depois não reempilha.
  useEffect(rastrearFoco, []);

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

  const ehTopo = useCallback(() => camadaDoTopo(pilha)?.id === id, [id]);
  const ehModalDoTopo = useCallback(() => modalDoTopo(pilha)?.id === id, [id]);
  return { ehTopo, ehModalDoTopo };
}

/**
 * Devolve o foco ao fechar uma camada: o que o resolvedor achar, senão o
 * elemento que a abriu, senão o conteúdo principal — o primeiro que ainda
 * estiver no DOM (`escolherAlvoDeFoco`). Roda um quadro depois, quando a
 * trava já devolveu a rolagem.
 *
 * O alvo do resolvedor recebe o foco com rolagem (quem o resolveu acabou de
 * trazê-lo para a tela); os outros, sem, porque a página já voltou para onde
 * estava.
 */
export function devolverFoco(abridor: HTMLElement | null, resolver?: ResolvedorFoco): void {
  requestAnimationFrame(async () => {
    let resolvido: HTMLElement | null = null;
    if (resolver) {
      try {
        resolvido = await resolver();
      } catch {
        resolvido = null;
      }
    }
    const principal = document.getElementById(ID_CONTEUDO);
    const alvo = escolherAlvoDeFoco([resolvido, abridor, principal]);
    // Se a pessoa já pôs o foco em outro lugar (clicou fora, outra camada
    // abriu), não tirar dela.
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && ativo.isConnected) return;
    alvo?.focus({ preventScroll: alvo !== resolvido });
  });
}
