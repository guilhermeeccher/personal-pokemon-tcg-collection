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
