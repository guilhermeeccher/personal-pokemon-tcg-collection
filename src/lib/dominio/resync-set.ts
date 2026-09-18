/**
 * Decide se um set precisa ser revisitado carta a carta nesta rodada de sync.
 *
 * **Por que existe (2026-08-26).** O sync buscava `GET /cards/{id}` para
 * *toda* carta de *todo* set, toda semana — ~53.000 requisições com o
 * japonês incluído, ~2h30 sob o teto de taxa novo. A FAQ da TCGdex pede
 * literalmente o contrário: "For bulk data needs, cache responses locally
 * rather than fetching the same data repeatedly."
 *
 * O atalho existe porque `GET /sets/{id}` já devolve a lista de ids das
 * cartas do set — de graça, numa requisição que a rodada faz de qualquer
 * jeito. Se essa lista bate exatamente com o que temos gravado, não há
 * carta nova nem carta removida: as ~200 requisições de detalhe daquele set
 * seriam 200 respostas idênticas às da semana passada.
 *
 * **O que este atalho NÃO detecta:** correção de metadado numa carta que já
 * existe (raridade corrigida, ilustrador preenchido, imagem que passou a
 * existir no upstream). Para isso existe o modo profundo, que ignora a
 * comparação e revisita tudo — use periodicamente, não toda semana.
 */

export interface LinhaLocalSet {
  id: string;
  ativa: boolean;
}

export interface ContextoResyncSet {
  /** Ids das cartas que o upstream lista para este set agora. */
  idsUpstream: readonly string[];
  /** O que já está gravado no catálogo local para este set e idioma. */
  linhasLocais: readonly LinhaLocalSet[];
  /** Modo profundo: revisita tudo, ignorando a comparação. */
  profundo?: boolean;
}

export interface DecisaoResyncSet {
  precisaResync: boolean;
  /** Frase curta para o relatório do sync. Nunca vazia. */
  motivo: string;
}

export function decidirResyncSet(ctx: ContextoResyncSet): DecisaoResyncSet {
  if (ctx.profundo) {
    return { precisaResync: true, motivo: "modo profundo" };
  }

  // Só as ativas participam da comparação. Carta inativada de propósito
  // (sumiu do upstream numa rodada anterior) não pode manter o set em
  // resync eterno — ela simplesmente não está mais no upstream, e o
  // conjunto de ativas é que precisa espelhar o que existe lá.
  const ativasLocais = new Set(
    ctx.linhasLocais.filter((l) => l.ativa).map((l) => l.id),
  );

  if (ativasLocais.size === 0) {
    return { precisaResync: true, motivo: "set novo no catálogo local" };
  }

  const upstream = new Set(ctx.idsUpstream);

  // Carta que voltou ao upstream depois de inativada cai aqui: o id está no
  // upstream e não está entre as ativas.
  const novas = [...upstream].filter((id) => !ativasLocais.has(id));
  const sumidas = [...ativasLocais].filter((id) => !upstream.has(id));

  if (novas.length === 0 && sumidas.length === 0) {
    return { precisaResync: false, motivo: "inalterado" };
  }

  const partes: string[] = [];
  if (novas.length > 0) partes.push(`${novas.length} carta(s) nova(s)`);
  if (sumidas.length > 0) {
    partes.push(`${sumidas.length} carta(s) fora do upstream`);
  }
  return { precisaResync: true, motivo: partes.join(", ") };
}
