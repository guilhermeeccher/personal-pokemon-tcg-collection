/**
 * Painel — superfície de cartão reaproveitável (fundo `surface`, traço
 * fino `hairline`, canto de 18px e a sombra quente `shadow-1` do design
 * system; nunca aninhado dentro de outro Painel). Extraído das bordas e
 * paddings soltos que se repetiam nas telas (cartões da home, seções da
 * visão geral, blocos de aviso/edição em coleções, filtros do inventário
 * etc.).
 *
 * Só apresentação: não tem estado, não decide nada — quem usa continua
 * dono do conteúdo e do comportamento.
 */

import type { ElementType, ReactNode } from "react";

const PADDING = {
  sm: "p-3",
  md: "p-4",
} as const;

export function Painel({
  as: Componente = "div",
  padding = "md",
  className = "",
  children,
  ...props
}: {
  as?: ElementType;
  padding?: keyof typeof PADDING;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Componente
      className={`rounded-card border border-hairline bg-surface shadow-1 ${PADDING[padding]} ${className}`}
      {...props}
    >
      {children}
    </Componente>
  );
}
