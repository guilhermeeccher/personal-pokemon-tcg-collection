/**
 * Tabela — casca compartilhada das 3 tabelas do sistema (inventário,
 * repetidas, grade do cadastro por set): container com rolagem
 * horizontal e borda, cabeçalho em caixa alta e tom `muted`, linhas
 * separadas por um traço fino. `thead`/`tbody`/`tr`/`td` continuam
 * escritos por quem chama (colspan, checkbox de seleção etc. variam
 * tela a tela) — só a moldura e as classes de cor são compartilhadas.
 *
 * O cabeçalho é `sticky` (`classesCelulaCabecalho`), mas só gruda quando a
 * tabela tem rolagem própria: com `rolagemPropria`, de `md` para cima, o
 * wrapper ganha altura e é ele quem rola. Sem isso o wrapper `overflow-auto`
 * não tem altura própria e o `sticky` não tem onde grudar.
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

/* ------------------------------------------------------------------------
   Tabela empilhada (só abaixo de 768px)

   Uma tabela de 8 colunas não cabe em 393px, e rolar de lado esconde a
   metade das colunas. No celular a MESMA marcação vira uma lista de cartões:
   cada `tr` é um cartão em grade e cada `td` um campo dele. Não existe uma
   segunda árvore (uma `<table>` e uma lista paralela): o que o usuário edita
   é um só, com os mesmos refs, `tabIndex`, Enter e memoização. De 768px para
   cima, estas classes não existem e a tabela é a de sempre.

   Como usar, na tela que empilha:
     <Tabela className={classesTabelaEmpilhada}>
       <thead className={classesCabecalhoEmpilhado}> ... </thead>
       <tbody className={classesTabelaEmpilhada}>
         <tr className={`${classesLinha} ${classesLinhaEmpilhada} ...`}>
           <td className={`... ${classesCelulaEmpilhada}`}> ... </td>

   O desenho dos campos dentro do cartão (colunas da grade, `col-span`, quem
   ocupa a linha inteira) é da tela: ela soma classes `max-md:grid-cols-*` e
   `max-md:col-span-*` à linha e às células. O que vem pronto aqui é só o
   esqueleto.

   - Cada campo precisa de nome acessível próprio (`aria-label`): o cabeçalho
     some, e um rótulo de coluna só como texto auxiliar não o substitui.
   - `colSpan` de linha de estado ("Nenhum resultado", carregando) é revisado
     por quem empilha: numa linha em grade, vira `max-md:col-span-full`.
   - Cabeçalho com controle dentro (o "selecionar todos") não pode usar
     `classesCabecalhoEmpilhado`, que o esconde inclusive de quem lê a tela:
     usa o conjunto `...ComControle`, que deixa só a célula do controle à
     mostra, como uma faixa acima das linhas. Nada é duplicado nem fica
     focável escondido: as demais células saem de cena com `hidden`.
   ------------------------------------------------------------------------ */

/** `table` e `tbody`: deixam de ser tabela e viram blocos empilhados. */
export const classesTabelaEmpilhada = "max-md:block max-md:w-full";

/** `thead` cujos rótulos de coluna sobram: escondido só visualmente (leitor
 *  de tela continua lendo). Não use quando há controle dentro do `thead`. */
export const classesCabecalhoEmpilhado = "max-md:sr-only";

/** `tr` de dados: um cartão em grade. Soma `max-md:grid-cols-*` da tela. */
export const classesLinhaEmpilhada = "max-md:grid max-md:gap-x-3 max-md:gap-y-2 max-md:p-3";

/** `td`: um campo do cartão. Sem o padding da tabela (o espaço é o `gap` da
 *  linha) e com `min-w-0`, para o conteúdo poder encolher dentro da grade. */
export const classesCelulaEmpilhada = "max-md:block max-md:min-w-0 max-md:p-0";

/** `thead` com um controle dentro: continua visível, como bloco. */
export const classesCabecalhoComControle = "max-md:block";

/** `tr` do cabeçalho com controle: uma faixa compacta de uma linha. */
export const classesLinhaCabecalhoComControle = "max-md:flex max-md:items-center max-md:gap-3 max-md:px-3";

/** `th` do cabeçalho com controle que NÃO é o controle: sai de cena. */
export const classesCelulaCabecalhoOculta = "max-md:hidden";

/** `th` que carrega o controle ("selecionar todos"): fica à mostra, com a
 *  altura do alvo de toque, e o `label` dentro dele é a área clicável. */
export const classesCelulaCabecalhoControle = "max-md:flex max-md:min-h-11 max-md:items-center max-md:gap-2";

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
