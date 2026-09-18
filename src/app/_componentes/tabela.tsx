/**
 * Tabela — casca compartilhada das 3 tabelas do sistema (inventário,
 * repetidas, grade do cadastro por set): container com rolagem
 * horizontal e borda, cabeçalho em caixa alta e tom `muted`, linhas
 * separadas por um traço fino. `thead`/`tbody`/`tr`/`td` continuam
 * escritos por quem chama (colspan, checkbox de seleção etc. variam
 * tela a tela) — só a moldura e as classes de cor são compartilhadas.
 *
 * O cabeçalho ainda NÃO é sticky. O design system pede cabeçalho fixo, mas
 * isso depende de a área de conteúdo ter rolagem própria — hoje a página
 * inteira rola, e o wrapper aqui é `overflow-x-auto`, um contêiner de
 * rolagem sem altura própria, onde `sticky` não teria onde grudar. Entra
 * junto com o "chrome fixo, conteúdo rola" da Fase C.
 */

import type { ReactNode } from "react";

export const classesLinhaCabecalho = "text-left";
/* O fundo e a régua inferior vivem na CÉLULA, não na linha: `position:
   sticky` gruda por célula, e um `tr` transparente deixaria as linhas
   passarem por baixo do cabeçalho. A régua é sombra interna em vez de
   `border-b` porque, com `border-collapse`, a borda de um `th` sticky
   simplesmente não é pintada pelo navegador. */
export const classesCelulaCabecalho =
  "sticky top-0 z-10 bg-surface-hover p-2 text-[11px] font-bold tracking-[0.08em] text-subtle uppercase shadow-[inset_0_-1px_0_var(--line-2)]";
export const classesLinha =
  "border-b border-hairline [transition:var(--transition-control)] hover:bg-surface-hover";

export function Tabela({
  children,
  className = "",
  rolagemPropria = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Faz a tabela ocupar a altura restante do painel e rolar sozinha, com o
   * cabeçalho grudado no topo.
   *
   * Não são "duas barras de rolagem competindo": a tela que liga isso passa
   * a caber inteira na altura do painel, então o conteúdo em volta não rola
   * mais e sobra **uma** barra só, a da tabela. Filtros e paginação ficam
   * parados, e o cabeçalho para de sumir — que é o problema real numa
   * tabela de 12 colunas.
   *
   * Só do `md` para cima. No mobile a página inteira rola, como sempre.
   */
  rolagemPropria?: boolean;
}) {
  return (
    <div
      className={`overflow-auto rounded-card border border-hairline bg-surface ${
        rolagemPropria ? "md:min-h-0 md:flex-1" : ""
      }`}
    >
      <table className={`w-full border-collapse text-sm ${className}`}>{children}</table>
    </div>
  );
}
