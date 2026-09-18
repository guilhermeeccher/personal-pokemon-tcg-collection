/**
 * Alerta — painel de aviso/sucesso/erro em destaque (o "Catálogo: EN",
 * "catálogo incompleto", o link de elegíveis em coleções, o aviso de
 * "confirma fora de padrão"). Mesmo papel do Distintivo, em escala de
 * bloco em vez de etiqueta.
 */

import type { ReactNode } from "react";

export type TomAlerta = "neutro" | "sucesso" | "aviso" | "perigo";

const TONS: Record<TomAlerta, string> = {
  neutro: "border-line bg-surface-hover text-foreground",
  sucesso: "border-success/30 bg-success-soft text-success-fg",
  aviso: "border-warning/30 bg-warning-soft text-warning-fg",
  perigo: "border-danger/30 bg-danger-soft text-danger-fg",
};

export function Alerta({
  tom = "neutro",
  className = "",
  children,
}: {
  tom?: TomAlerta;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-control border p-3 text-sm ${TONS[tom]} ${className}`}>{children}</div>
  );
}
