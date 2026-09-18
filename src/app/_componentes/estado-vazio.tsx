/**
 * EstadoVazio — mensagem central para lista/tabela sem resultado
 * ("Nenhuma cópia encontrada com esses filtros.", "Nenhuma coleção
 * ainda.", "Nada falta…" etc.). Só texto centralizado no tom `subtle`;
 * quem chama decide o container (célula de tabela com colSpan, item de
 * lista, div solta).
 */

import type { ReactNode } from "react";

export function EstadoVazio({
  as: Componente = "p",
  className = "",
  children,
  ...props
}: {
  as?: "p" | "li" | "td" | "div";
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Componente className={`text-center text-sm text-muted ${className}`} {...props}>
      {children}
    </Componente>
  );
}
