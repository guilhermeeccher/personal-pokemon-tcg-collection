/**
 * LinhaDistribuicao — uma linha dos painéis "Por expansão / raridade /
 * idioma / condição / variante": rótulo à esquerda, `contagem · pct%` em
 * mono à direita, barra embaixo.
 *
 * A linha inteira é clicável por contrato e abre o inventário já filtrado
 * — é assim que o site já funciona hoje, e é a promessa que o design
 * system faz (mas que o componente de exemplo dele deixou como stub).
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { BarraProgresso } from "./barra-progresso";

/**
 * Percentual com uma casa, no padrão pt-BR — vírgula, não ponto. O design
 * system manda formatar todo número em pt-BR, e misturar `35,9%` com
 * `42.6%` na mesma tela é o tipo de coisa que só aparece renderizada.
 */
export function formatarPercentual(pct: number): string {
  return `${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function LinhaDistribuicao({
  rotulo,
  nota,
  contagem,
  total,
  href,
  cor,
}: {
  rotulo: ReactNode;
  nota?: string;
  contagem: number;
  total: number;
  href?: string;
  /** Cor da barra. O design system pinta a barra com a cor do próprio
      recorte (raridade, condição, variante) — é onde o colecionador mais
      lê. Sem cor, cai no acento. */
  cor?: string;
}) {
  const pct = total > 0 ? (contagem / total) * 100 : 0;

  const conteudo = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-[13px] font-semibold text-strong">
          {rotulo}
          {nota && <span className="font-normal text-subtle"> ({nota})</span>}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums whitespace-nowrap text-muted">
          {contagem.toLocaleString("pt-BR")} · {formatarPercentual(pct)}
        </span>
      </div>
      {/* Barra sempre com um fio de largura, para a linha nunca parecer
          vazia quando a fatia é pequena demais para render pixel. */}
      <BarraProgresso valor={Math.max(pct, 0.6)} maximo={100} cor={cor} />
    </>
  );

  const classes =
    "-mx-2 flex flex-col gap-1.5 rounded-slot px-2 py-1.5 [transition:var(--transition-control)]";

  if (!href) return <div className={classes}>{conteudo}</div>;

  return (
    <Link href={href} className={`${classes} hover:bg-surface-hover`}>
      {conteudo}
    </Link>
  );
}
