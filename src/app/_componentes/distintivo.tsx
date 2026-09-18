/**
 * Distintivo — etiqueta pequena e colorida por tom semântico. Extraído
 * dos vários badges espalhados (alocada/livre no inventário, "já tem N"
 * e "fora de padrão" no cadastro/alocação, tipo da coleção, catálogo
 * incompleto etc.) — hoje cada tela reimplementa a mesma pílula com uma
 * combinação de cor ligeiramente diferente.
 *
 * Pílula, como toda forma de chip no design system — ali nada é de canto
 * quadrado.
 */

import type { ReactNode } from "react";

export type TomDistintivo = "neutro" | "acento" | "sucesso" | "aviso" | "perigo";

const TONS: Record<TomDistintivo, string> = {
  neutro: "bg-surface-hover text-muted",
  acento: "bg-accent-soft text-accent-soft-fg",
  sucesso: "bg-success-soft text-success-fg",
  aviso: "bg-warning-soft text-warning-fg",
  perigo: "bg-danger-soft text-danger-fg",
};

export function Distintivo({
  tom = "neutro",
  className = "",
  children,
  title,
}: {
  tom?: TomDistintivo;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONS[tom]} ${className}`}
    >
      {children}
    </span>
  );
}
