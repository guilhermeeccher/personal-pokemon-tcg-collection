/**
 * Distintivo — etiqueta pequena e colorida por tom semântico. Extraído
 * dos vários badges espalhados (alocada/livre no inventário, "já tem N"
 * e "fora de padrão" no cadastro/alocação, tipo da coleção, catálogo
 * incompleto etc.) — hoje cada tela reimplementa a mesma pílula com uma
 * combinação de cor ligeiramente diferente.
 *
 * Pílula, como toda forma de chip no design system — ali nada é de canto
 * quadrado.
 *
 * `dica` (padrão `false`): o `title` não existe no celular. Com `dica` e um
 * `title`, a etiqueta vem envolta em `Dica` (botão "i" que mostra o texto ao
 * toque). Sem `title` não há o que mostrar e a prop não faz nada. Só ligue
 * onde a etiqueta está solta, fora de `label`, `a` e `button`. Com `false` —
 * ou em 768px ou mais — a saída é a de sempre.
 */

import type { ReactNode } from "react";

import { Dica } from "./dica";

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
  dica = false,
}: {
  tom?: TomDistintivo;
  className?: string;
  children: ReactNode;
  title?: string;
  dica?: boolean;
}) {
  const etiqueta = (
    <span
      title={title}
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONS[tom]} ${className}`}
    >
      {children}
    </span>
  );
  return dica && title ? <Dica texto={title}>{etiqueta}</Dica> : etiqueta;
}
