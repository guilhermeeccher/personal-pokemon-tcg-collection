/**
 * CabecalhoPagina — título + subtítulo + ações opcionais à direita.
 * Extraído do par `<h1 className="text-xl font-semibold">` +
 * `<p className="text-sm text-neutral-500">` repetido no topo de toda
 * tela (home, inventário, visão geral, repetidas, cadastro por set,
 * cadastro por busca, coleções, nova coleção, o que falta).
 *
 * O título usa a face arredondada (via a regra global de h1-h4) no tamanho
 * --fs-title-1. Duas telas reimplementavam este cabeçalho à mão — `colecoes/
 * falta` e `colecoes/[id]/opcoes-compra` — e passaram a usar o componente.
 */

import type { ReactNode } from "react";

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[length:var(--fs-title-1)] text-strong">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 gap-2">{acoes}</div>}
    </div>
  );
}
