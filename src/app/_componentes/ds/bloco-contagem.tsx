/**
 * BlocoContagem — o número grande sobre o rótulo, das quatro contagens do
 * topo da visão geral (Cartas distintas · Unidades totais · Alocadas ·
 * Livres).
 *
 * Quebra a regra dos numerais de propósito, e o design system diz por quê:
 * este número vai na face **display**, não na mono, porque "406 cartas
 * distintas" é manchete, não medição. É o único lugar onde isso vale.
 */

import Link from "next/link";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

export function BlocoContagem({
  valor,
  rotulo,
  tom = "var(--text-strong)",
  href,
}: {
  valor: number | string;
  rotulo: ReactNode;
  tom?: string;
  href?: string;
}) {
  const locale = useLocale();
  const formatado = typeof valor === "number" ? valor.toLocaleString(locale) : valor;

  const conteudo = (
    <>
      <span
        className="font-display text-[length:var(--fs-display-2)] leading-[1.05] font-bold tabular-nums"
        style={{ color: tom }}
      >
        {formatado}
      </span>
      <span className="text-[13px] text-muted">{rotulo}</span>
    </>
  );

  const classes = "flex flex-col gap-1 rounded-card border border-hairline bg-surface px-6 py-5 shadow-1";

  if (!href) return <div className={classes}>{conteudo}</div>;

  return (
    <Link
      href={href}
      className={`${classes} [transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3`}
    >
      {conteudo}
    </Link>
  );
}
