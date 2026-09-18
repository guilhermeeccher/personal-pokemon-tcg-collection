/**
 * Tradução do tipo da carta para o vocabulário de energia do design system.
 *
 * O catálogo guarda o tipo como o upstream escreve, em inglês
 * (`carta_catalogo.tipos`: "Water", "Psychic", "Colorless"…). O design
 * system nomeia as onze cores em português (`--energy-agua`,
 * `--energy-psiquico`, `--energy-incolor`…). Este módulo é a ponte, e é a
 * única coisa entre o dado e a cor da vaga.
 *
 * Os onze valores do enum cobrem exatamente os onze valores distintos que
 * existem no banco hoje (consultados em 2026-09-03) — não é um mapa
 * defensivo com sobras "por via das dúvidas": é o conjunto real.
 *
 * **Vazio é resposta legítima, não falha.** Treinador e Energia não têm
 * tipo, e carta que o importador ainda não visitou também vem sem. Nesses
 * casos a vaga fica no papel neutro, sem tinta — degrada, não quebra.
 */

export const TIPOS_ENERGIA = [
  "fogo",
  "agua",
  "planta",
  "eletrico",
  "psiquico",
  "lutador",
  "sombrio",
  "metal",
  "fada",
  "dragao",
  "incolor",
] as const;
export type TipoEnergia = (typeof TIPOS_ENERGIA)[number];

/** Como o upstream escreve → como o design system nomeia a cor. */
const TRADUCAO: Record<string, TipoEnergia> = {
  fire: "fogo",
  water: "agua",
  grass: "planta",
  lightning: "eletrico",
  psychic: "psiquico",
  fighting: "lutador",
  darkness: "sombrio",
  metal: "metal",
  fairy: "fada",
  dragon: "dragao",
  colorless: "incolor",
};

/**
 * O tipo que tinge a vaga, a partir da lista do catálogo.
 *
 * Carta de dois tipos (115 no catálogo hoje) usa o primeiro: a vaga tem uma
 * cor de fundo só, e o primeiro é o tipo principal na convenção do
 * upstream. Lista vazia, tipo desconhecido ou `null` devolvem `null` — a
 * vaga então fica neutra, e nunca é pintada com uma cor chutada.
 */
export function energiaDaCarta(tipos: readonly string[] | null | undefined): TipoEnergia | null {
  if (!tipos || tipos.length === 0) return null;
  for (const tipo of tipos) {
    const energia = TRADUCAO[tipo.trim().toLowerCase()];
    if (energia) return energia;
  }
  return null;
}
