/**
 * Modal — véu + painel centralizado, elevado. O véu é o único lugar do
 * sistema com transparência e blur: ameixa a 52% (`--surface-overlay`)
 * com desfoque, exatamente como o design system especifica. Extraído dos 4 modais que hoje reimplementam a mesma
 * estrutura (`ModalEdicao`, `ModalAlocarDestino` e `ModalEdicaoMassa` no
 * inventário; `ModalAlocarVaga` na coleção) — o conteúdo e o
 * comportamento de cada um continuam onde estavam, só a casca visual é
 * compartilhada.
 *
 * `as="form"` permite repassar `onSubmit` para os modais que são
 * formulários (evita reintroduzir um <form> aninhado dentro de um <div>).
 */

import type { ElementType, ReactNode } from "react";

export function Modal({
  as: Componente = "div",
  className = "",
  children,
  ...props
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[var(--surface-overlay)] p-4 backdrop-blur-[10px] backdrop-saturate-150">
      <Componente
        className={`flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[var(--raio-lg)] border border-hairline bg-surface-elevated p-5 text-sm text-foreground shadow-4 ${className}`}
        {...props}
      >
        {children}
      </Componente>
    </div>
  );
}
