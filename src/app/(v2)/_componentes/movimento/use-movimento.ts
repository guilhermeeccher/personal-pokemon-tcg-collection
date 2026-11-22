"use client";

/**
 * `useMovimento()` — a decisão de movimento e de modo leve da v2, lida do
 * navegador e **reativa**: muda sozinha quando o sistema liga ou desliga o
 * movimento reduzido, quando o interruptor manual muda (nesta aba ou em
 * outra) e quando uma nova medição de quadros dá outro resultado.
 *
 * A regra está em `preferencias-movimento.ts`; aqui só os sinais.
 *
 * - **Movimento reduzido:** `matchMedia` com ouvinte de `change`. O
 *   protótipo lia o valor uma vez, na carga; quem liga a opção com a página
 *   aberta continuava vendo tudo mexer.
 * - **Interruptor manual:** `localStorage`, leitura e escrita sempre em
 *   `try/catch` (janela privada, dados do site bloqueados, prévia: o acesso
 *   pode lançar). Sem armazenamento, o interruptor ainda vale nesta aba até
 *   recarregar. O evento `storage` traz a mudança feita em outra aba.
 * - **Heurística de quadros:** mede ~1 s de `requestAnimationFrame` com a
 *   página visível, depois de um respiro para a hidratação não contar como
 *   lentidão; mede de novo sempre que a aba volta a ficar visível (o modo de
 *   economia costuma ser ligado com o app no fundo). Só mede com o
 *   interruptor em `auto` e sem movimento reduzido — fora disso o resultado
 *   não decide nada. Uma medição sem sinal não apaga o resultado anterior.
 *
 * Os ouvintes existem só enquanto algum componente assina; sem assinante, o
 * módulo não mede nem escuta nada.
 *
 * No servidor e na hidratação vale `DECISAO_PADRAO` (completo, sem
 * movimento reduzido). Não há salto visível: em repouso a carta é uma
 * imagem simples em qualquer modo, e o primeiro movimento só acontece
 * depois de uma interação, quando o valor real já chegou.
 */

import { useCallback, useSyncExternalStore } from "react";

import {
  CHAVE_ESCOLHA_MODO,
  DECISAO_PADRAO,
  type DecisaoMovimento,
  type EscolhaModo,
  type ModoEfeitos,
  decidirMovimento,
  lerEscolhaModo,
  modoPelosQuadros,
} from "./preferencias-movimento";

const CONSULTA_REDUZIDO = "(prefers-reduced-motion: reduce)";
/** Respiro antes de medir: hidratação e carga de imagens inflam os primeiros quadros. */
const ESPERA_ANTES_DE_MEDIR_MS = 1500;
const DURACAO_MEDICAO_MS = 1000;

let escolhaEmMemoria: EscolhaModo | null = null;
let heuristica: ModoEfeitos | null = null;
let decisaoAtual: DecisaoMovimento | null = null;
const ouvintes = new Set<() => void>();
let desmontar: (() => void) | null = null;
/** Pede uma medição nova (quando o interruptor volta para `auto`). */
let medicaoAgora: (() => void) | null = null;

function lerReduzido(): boolean {
  return window.matchMedia(CONSULTA_REDUZIDO).matches;
}

function lerEscolhaGuardada(): EscolhaModo {
  try {
    return lerEscolhaModo(window.localStorage.getItem(CHAVE_ESCOLHA_MODO));
  } catch {
    return "auto";
  }
}

function escolhaAtual(): EscolhaModo {
  if (escolhaEmMemoria === null) escolhaEmMemoria = lerEscolhaGuardada();
  return escolhaEmMemoria;
}

function calcular(): DecisaoMovimento {
  return decidirMovimento({ reduzido: lerReduzido(), escolha: escolhaAtual(), heuristica });
}

/** Recalcula e avisa só se algo mudou (o snapshot tem de ser estável). */
function atualizar() {
  const nova = calcular();
  const velha = decisaoAtual;
  if (
    velha &&
    velha.modo === nova.modo &&
    velha.origemModo === nova.origemModo &&
    velha.reduzido === nova.reduzido &&
    velha.mola === nova.mola &&
    velha.animacaoContinua === nova.animacaoContinua &&
    velha.transicoes === nova.transicoes
  ) {
    return;
  }
  decisaoAtual = nova;
  for (const aviso of ouvintes) aviso();
}

function iniciar(): () => void {
  const mq = window.matchMedia(CONSULTA_REDUZIDO);
  let espera: ReturnType<typeof setTimeout> | null = null;
  let pedido: number | null = null;

  function pararMedicao() {
    if (espera !== null) clearTimeout(espera);
    if (pedido !== null) cancelAnimationFrame(pedido);
    espera = null;
    pedido = null;
  }

  function medir() {
    pararMedicao();
    if (document.visibilityState !== "visible" || escolhaAtual() !== "auto" || lerReduzido()) return;
    espera = setTimeout(() => {
      espera = null;
      const intervalos: number[] = [];
      let anterior: number | null = null;
      let inicio: number | null = null;
      const quadro = (t: number) => {
        if (anterior !== null) intervalos.push(t - anterior);
        anterior = t;
        inicio ??= t;
        if (t - inicio < DURACAO_MEDICAO_MS) {
          pedido = requestAnimationFrame(quadro);
          return;
        }
        pedido = null;
        const resultado = modoPelosQuadros(intervalos);
        if (resultado !== null) {
          heuristica = resultado;
          atualizar();
        }
      };
      pedido = requestAnimationFrame(quadro);
    }, ESPERA_ANTES_DE_MEDIR_MS);
  }

  const aoMudarReduzido = () => {
    atualizar();
    medir();
  };
  const aoMudarArmazenamento = (e: StorageEvent) => {
    if (e.key !== null && e.key !== CHAVE_ESCOLHA_MODO) return;
    escolhaEmMemoria = lerEscolhaModo(e.newValue);
    atualizar();
    medir();
  };
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "visible") medir();
    else pararMedicao();
  };

  mq.addEventListener("change", aoMudarReduzido);
  window.addEventListener("storage", aoMudarArmazenamento);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  medicaoAgora = medir;
  medir();

  return () => {
    pararMedicao();
    medicaoAgora = null;
    mq.removeEventListener("change", aoMudarReduzido);
    window.removeEventListener("storage", aoMudarArmazenamento);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  };
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  if (ouvintes.size === 1) {
    desmontar = iniciar();
    // Algo pode ter mudado entre o primeiro snapshot e a assinatura.
    atualizar();
  }
  return () => {
    ouvintes.delete(aviso);
    if (ouvintes.size === 0 && desmontar) {
      desmontar();
      desmontar = null;
    }
  };
}

function snapshot(): DecisaoMovimento {
  decisaoAtual ??= calcular();
  return decisaoAtual;
}

const snapshotServidor = () => DECISAO_PADRAO;

export function useMovimento(): DecisaoMovimento {
  return useSyncExternalStore(assinar, snapshot, snapshotServidor);
}

/**
 * Grava o interruptor manual. `auto` devolve a decisão à heurística e
 * dispara uma medição nova. Gravar é melhor esforço: sem `localStorage`, a
 * escolha vale até recarregar.
 */
export function definirEscolhaModo(escolha: EscolhaModo): void {
  escolhaEmMemoria = escolha;
  try {
    if (escolha === "auto") window.localStorage.removeItem(CHAVE_ESCOLHA_MODO);
    else window.localStorage.setItem(CHAVE_ESCOLHA_MODO, escolha);
  } catch {
    // Sem armazenamento: a escolha fica só em memória, nesta aba.
  }
  atualizar();
  if (escolha === "auto") medicaoAgora?.();
}

/**
 * O interruptor para a tela de Ajustes: a escolha guardada (não a
 * decisão) e o modo efetivo, para a tela dizer "Automático (leve agora)".
 */
export function useEscolhaModo(): {
  escolha: EscolhaModo;
  decisao: DecisaoMovimento;
  definir: (escolha: EscolhaModo) => void;
} {
  const decisao = useMovimento();
  // A escolha muda sempre junto com uma notificação (`definirEscolhaModo` e o
  // evento `storage` chamam `atualizar`), e a origem do modo a reflete.
  const escolha: EscolhaModo = decisao.origemModo === "manual" ? decisao.modo : "auto";
  const definir = useCallback((e: EscolhaModo) => definirEscolhaModo(e), []);
  return { escolha, decisao, definir };
}
