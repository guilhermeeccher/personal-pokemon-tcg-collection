/**
 * Living Dex — o Pokémon de capa de cada jogo, para o cartão do jogo na
 * Visão geral. Número nacional; a imagem é o render do HOME
 * (`urlRenderHomeDex`).
 *
 * Fonte: Bulbapedia, "Game mascot" e a legenda da caixa de cada jogo
 * (conferido em 2026-10-12). O GO não tem lendário de capa: o Pikachu é
 * escolha do projeto, não dado.
 */
export const CAPA_DO_JOGO: Readonly<Record<string, number>> = {
  firered: 6, // Charizard
  leafgreen: 3, // Venusaur
  go: 25, // Pikachu (escolha, ver acima)
  "lets-go-pikachu": 25,
  "lets-go-eevee": 133,
  sword: 888, // Zacian
  shield: 889, // Zamazenta
  "brilliant-diamond": 483, // Dialga
  "shining-pearl": 484, // Palkia
  "legends-arceus": 493,
  scarlet: 1007, // Koraidon
  violet: 1008, // Miraidon
  "legends-za": 718, // Zygarde
};
