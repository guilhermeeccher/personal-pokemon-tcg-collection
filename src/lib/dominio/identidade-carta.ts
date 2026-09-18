/**
 * A identidade estável de uma carta da LigaPokemon — o que permite reconhecer
 * "é esta mesma carta" entre duas varreduras diferentes.
 *
 * Módulo puro.
 *
 * ## Por que isto precisa existir
 *
 * A escolha de compra dele (`escolha_compra`) é durável: ele faz a triagem uma
 * vez e ela sobrevive a varredura nenhuma existir. Mas a linha da varredura
 * (`liga_opcao`) é descartável — nasce e morre com a rodada. Ligar as duas por
 * `liga_opcao.id` seria prender o durável ao descartável, que é exatamente o
 * defeito que esta tabela veio corrigir.
 *
 * Então a ponte é a identidade da carta no catálogo **deles**.
 *
 * ## Por que não o nosso `carta_id`
 *
 * Porque ~30% das opções baratas não existem no nosso catálogo (chinesas,
 * Carddass, Topsun, promos coreanos) — decisão de 2026-09-02 foi mostrá-las
 * marcadas em vez de sumir com elas. Se a identidade dependesse do nosso
 * catálogo, justamente essas não poderiam ser escolhidas de forma durável.
 *
 * ## A chave: edição + número
 *
 * O `edid` é o id interno da edição deles e é a chave boa. Nem toda linha de
 * busca o traz, e aí a sigla entra no lugar — com prefixo, para que o `edid`
 * `738` nunca colida com uma edição de sigla `738`.
 *
 * O número é normalizado sem zero à esquerda: a busca devolve `003` e a linha
 * de oferta às vezes `3`, e as duas são a mesma carta. Sem isso, a escolha
 * feita numa varredura não se reconheceria na seguinte.
 */

export interface CartaIdentificavel {
  /** Id interno da edição no site deles. */
  edid: number | null;
  /** Sigla da edição, como eles escrevem: `MEG`, `SW`. */
  edicaoSigla: string;
  /** Número impresso, como veio (`003`, `77`, `TG01`). */
  numero: string;
}

/** `003` e `3` são a mesma carta; `TG01` não tem zero à esquerda a remover. */
export function normalizarNumero(numero: string): string {
  return numero.trim().replace(/^0+(?=\d)/, "");
}

/**
 * A identidade, como texto — é o que vai gravado e comparado.
 *
 * O prefixo separa os dois espaços de nome: `edid:738/131` nunca é igual a
 * `sigla:738/131`.
 */
export function identidadeDaCarta(carta: CartaIdentificavel): string {
  const edicao =
    carta.edid !== null && Number.isFinite(carta.edid)
      ? `edid:${carta.edid}`
      : `sigla:${carta.edicaoSigla.trim().toUpperCase()}`;
  return `${edicao}/${normalizarNumero(carta.numero)}`;
}
