/**
 * Campo — rótulo + controle, para os formulários espalhados pelo
 * cadastro por busca, cadastro por set, nova coleção e os modais do
 * inventário/coleções. Só envolve o rótulo; o input/select/textarea
 * continua sendo escrito por quem chama, com seu próprio value/onChange
 * — nenhum comportamento novo, só o wrapper de apresentação.
 *
 * `classesEntrada` é a classe compartilhada do próprio controle
 * (input/select/textarea), para quem prefere aplicá-la direto sem usar
 * `Campo` (ex.: dentro de uma célula de tabela, sem rótulo visível).
 */

import type { ReactNode } from "react";

/* Altura mínima em vez de fixa: a mesma classe veste <input>, <select> e
   <textarea> (este último com `rows`, que precisa poder crescer).

   No celular (`max-md:`): 16px e 44px de altura mínima. Abaixo de 16px o
   Safari do iPhone dá zoom na página ao focar o campo e não desfaz sozinho;
   44px é o alvo de toque mínimo. De 768px para cima, nada muda. */
export const classesEntrada =
  "min-h-[34px] rounded-control border border-line bg-surface px-3 py-1.5 text-foreground placeholder:text-subtle [transition:var(--transition-control)] max-md:min-h-11 max-md:text-base";

export function Campo({
  rotulo,
  ajuda,
  className = "",
  children,
}: {
  rotulo?: ReactNode;
  ajuda?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      {rotulo && <span className="font-medium text-muted">{rotulo}</span>}
      {children}
      {ajuda && <span className="text-xs text-subtle">{ajuda}</span>}
    </label>
  );
}
