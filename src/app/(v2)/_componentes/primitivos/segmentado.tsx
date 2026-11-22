"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";

import estilos from "./segmentado.module.css";
import { ATRIBUTO_POLEGAR, usePolegar } from "./use-polegar";

export interface OpcaoSegmentado<V extends string> {
  valor: V;
  rotulo: ReactNode;
  icone?: ReactNode;
  /** Número ao lado do rótulo (quantas cartas na aba, por exemplo). */
  contagem?: number;
  /** Rótulo acessível quando o visível é só ícone ou abreviado. */
  rotuloAcessivel?: string;
  desabilitada?: boolean;
}

/**
 * Segmentado com polegar líquido. Dois papéis:
 *
 * - `escolha` (padrão): um `radiogroup` — escolher um valor entre poucos
 *   (tamanho do fichário, modo leve).
 * - `abas`: um `tablist` — trocar o painel da tela. Quem chama liga cada aba
 *   ao painel por `idPainel`.
 *
 * Em ambos, as setas trocam a escolha e levam o foco, e só o item escolhido
 * entra na ordem do Tab (o padrão de grupo de rádio). Controlado: `valor` é
 * obrigatório, como em todo controle que cruza 768 px.
 */
export function Segmentado<V extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  papel = "escolha",
  idPainel,
  pequeno = false,
  largo = false,
}: {
  /** Nome do grupo para o leitor de tela. */
  rotulo: string;
  opcoes: readonly OpcaoSegmentado<V>[];
  valor: V;
  aoMudar: (valor: V) => void;
  papel?: "escolha" | "abas";
  /** Só em `abas`: o `id` do painel controlado, por valor. */
  idPainel?: (valor: V) => string;
  pequeno?: boolean;
  largo?: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const polegar = useRef<HTMLSpanElement>(null);
  usePolegar(contenedor, polegar, valor);

  const habilitadas = opcoes.filter((o) => !o.desabilitada);
  // Só um item na ordem do Tab: o escolhido, ou o primeiro habilitado se o
  // valor não estiver entre as opções (senão o grupo ficaria inalcançável).
  const focavel = habilitadas.some((o) => o.valor === valor) ? valor : habilitadas[0]?.valor;

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const ponta = { Home: 0, End: habilitadas.length - 1 }[e.key];
    if (passo === undefined && ponta === undefined) return;
    e.preventDefault();
    const atual = habilitadas.findIndex((o) => o.valor === valor);
    const proximo =
      ponta !== undefined ? ponta : (atual + (passo ?? 0) + habilitadas.length) % habilitadas.length;
    const alvo = habilitadas[proximo];
    if (!alvo) return;
    aoMudar(alvo.valor);
    contenedor.current?.querySelector<HTMLElement>(`[data-valor="${CSS.escape(alvo.valor)}"]`)?.focus();
  }

  const ehAbas = papel === "abas";
  const classe = [estilos.segmentado, pequeno ? estilos.pequeno : null, largo ? estilos.largo : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={contenedor}
      className={classe}
      role={ehAbas ? "tablist" : "radiogroup"}
      aria-label={rotulo}
      onKeyDown={aoTeclar}
    >
      <span ref={polegar} className={estilos.polegar} aria-hidden />
      {opcoes.map((o) => {
        const escolhida = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            className={estilos.opcao}
            data-valor={o.valor}
            {...{ [ATRIBUTO_POLEGAR]: escolhida ? "true" : "false" }}
            role={ehAbas ? "tab" : "radio"}
            aria-checked={ehAbas ? undefined : escolhida}
            aria-selected={ehAbas ? escolhida : undefined}
            aria-controls={ehAbas && idPainel ? idPainel(o.valor) : undefined}
            aria-label={o.rotuloAcessivel}
            tabIndex={o.valor === focavel ? 0 : -1}
            disabled={o.desabilitada}
            onClick={() => aoMudar(o.valor)}
          >
            {o.icone}
            {o.rotulo}
            {o.contagem !== undefined && <span className={`${estilos.contagem} v2-num`}>{o.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}
