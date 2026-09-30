/**
 * Fallback de idioma de catálogo (AGENTS.md regra 7; spec §2, §3.2).
 *
 * O upstream TCGdex não tem carta a carta em `pt` para um subconjunto de
 * sets (Coleção Básica, Fóssil, Selva, HeartGold SoulSilver, EX Rubi e
 * Safira e outros — 33 na medição da Fase 0, mas a lista real é "o que o
 * sync não trouxe em pt", não um enum fixo). Para esses, a grade de
 * cadastro por set usa a linha `en` como identidade da carta
 * (`idioma_catalogo`), e o usuário registra o idioma FÍSICO da cópia à
 * parte — nunca os dois amarrados.
 *
 * Este módulo não decide isso a partir de uma lista hard-coded de sets:
 * decide a partir do que existe de fato no catálogo local (se há alguma
 * linha `pt` para aquele set). Isso cobre os 33 sets citados na spec e
 * qualquer outro set que só exista em `en` (na Fase 0, 109 sets de 199 em
 * `en` não têm nenhuma linha `pt` — universo maior que os 33 citados na
 * spec, que é a amostra, não o total).
 *
 * Módulo puro, sem I/O — testável sem banco. Quem chama decide como obter
 * `existePt` (tipicamente uma query `EXISTS` contra `carta_catalogo`).
 */

export type IdiomaCatalogo = "pt" | "en" | "jp";

/** Preferência de exibição, na ordem. */
const PRIORIDADE: readonly IdiomaCatalogo[] = ["pt", "en", "jp"];

/**
 * Decide qual idioma de catálogo usar para exibir a grade de um set,
 * a partir dos idiomas em que aquele set de fato existe no catálogo
 * local. Preferência `pt` > `en` > `jp`.
 *
 * **`jp` entrou em 2026-08-26** e não é detalhe: 116 sets japoneses não
 * têm nenhuma linha em pt nem en (são exclusivos do Japão, como o `SM3H`
 * do Charmander usado como caso real). Enquanto esta função só sabia
 * responder "pt ou en", esses sets apareciam no seletor de expansão mas
 * a grade de cadastro devolvia "Set não encontrado" — o japonês entrava
 * pela metade, visível e inutilizável.
 *
 * Sem nenhum idioma (set que não existe no catálogo), devolve `en` —
 * mantém o comportamento anterior para quem chama com lista vazia.
 */
export function resolverIdiomaCatalogoDoSet(
  idiomasPresentes: readonly IdiomaCatalogo[],
): IdiomaCatalogo {
  return PRIORIDADE.find((i) => idiomasPresentes.includes(i)) ?? "en";
}

/**
 * Ordem em que cada carta de um set procura a sua linha de catálogo, a
 * partir do idioma PREFERIDO (o `idiomaCatalogo` de uma coleção de set).
 *
 * **A decisão é carta a carta, não do set inteiro (2026-09-30).** O
 * upstream traduz um set aos poucos: o 30th Celebration chegou com 2
 * cartas em pt e 158 em en, e decidir pelo set inteiro dava duas saídas
 * ruins — ficar em pt e materializar 2 vagas de 128, ou cair para en e
 * perder as 2 que existem em pt. Carta a carta, cada número usa a linha
 * no idioma preferido quando ela existe, e a do outro idioma ocidental
 * quando não.
 *
 * **O japonês não entra como fallback de pt/en, nem o contrário.** O id e
 * o número de uma carta são os mesmos em pt e en (`30th-001` nos dois,
 * conferido nas 13.907 cartas que existem nos dois idiomas), então trocar
 * de linha não muda de carta. Com o japonês isso não vale: os sets
 * japoneses têm `set_id` próprio (o 30th japonês é o `M6a`), e nos quatro
 * que dividem o id com o inglês (neo1 a neo4) a numeração e o conteúdo são
 * outros — o neo1 tem 111 cartas "1..111" em en e 96 "001..096" em jp,
 * nenhum número em comum. Completar um com o outro criaria vagas de cartas
 * que não pertencem ao set.
 */
export function ordemIdiomasPorCarta(
  preferido: IdiomaCatalogo,
): readonly IdiomaCatalogo[] {
  switch (preferido) {
    case "pt":
      return ["pt", "en"];
    case "en":
      return ["en", "pt"];
    case "jp":
      return ["jp"];
  }
}

/**
 * Escolhe uma linha de catálogo por número de carta (`localId`), seguindo
 * `ordemIdiomasPorCarta(preferido)`. Linhas de idiomas fora da ordem são
 * ignoradas. Devolve na ordem da primeira aparição de cada número na
 * entrada — quem precisa da ordem impressa ordena depois
 * (`compararLocalId`).
 */
export function escolherLinhaPorCarta<
  T extends { localId: string; idioma: IdiomaCatalogo },
>(linhas: readonly T[], preferido: IdiomaCatalogo): T[] {
  const ordem = ordemIdiomasPorCarta(preferido);
  const escolhida = new Map<string, T>();
  for (const linha of linhas) {
    const posicao = ordem.indexOf(linha.idioma);
    if (posicao === -1) continue;
    const atual = escolhida.get(linha.localId);
    if (!atual || posicao < ordem.indexOf(atual.idioma)) {
      escolhida.set(linha.localId, linha);
    }
  }
  return [...escolhida.values()];
}

/**
 * Contagens de um set juntando as linhas dos idiomas considerados. Vale o
 * maior valor: a numeração oficial coincide entre pt e en em todo set do
 * catálogo, e o total diverge quando um idioma conhece mais secretas que o
 * outro (sm1: 163 em pt, 172 em en). Como o universo de cartas é a união
 * dos dois (`escolherLinhaPorCarta`), o total que o descreve é o maior.
 */
export function contagensDoSet(
  linhas: readonly { qtdOficial: number; qtdTotal: number }[],
): { qtdOficial: number; qtdTotal: number } {
  let qtdOficial = 0;
  let qtdTotal = 0;
  for (const l of linhas) {
    if (l.qtdOficial > qtdOficial) qtdOficial = l.qtdOficial;
    if (l.qtdTotal > qtdTotal) qtdTotal = l.qtdTotal;
  }
  return { qtdOficial, qtdTotal };
}
