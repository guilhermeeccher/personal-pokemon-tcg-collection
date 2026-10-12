/**
 * Living Dex — catálogo fixo de jogos e como cada um conecta ao HOME.
 *
 * Dado de domínio, versionado aqui, e não tabela que o usuário edita: o
 * usuário só marca quais possui (`dex_jogo_possuido`). Uma versão por linha
 * (FireRed e LeafGreen separados), porque o que muda entre versões — os
 * exclusivos — é justamente o que o planejamento precisa saber.
 *
 * ## `conexaoHome` é o campo que o planejamento mais usa
 *
 *  - `ida_e_volta`: o Pokémon vai ao HOME e pode voltar ao jogo.
 *  - `so_envio`: vai ao HOME e nunca volta; e nenhum Pokémon de outro jogo
 *    entra nele. Transferir é permanente.
 *
 * Conferido em 2026-10-11 contra a página oficial de transferências do HOME
 * (home.pokemon.com/en-us/move): GO e Pokémon Bank só enviam ("it cannot be
 * moved back"); Let's Go volta só para o próprio jogo — uma vez movido para
 * outro, "it cannot be returned to its original game!"; Sword/Shield,
 * Brilliant Diamond/Shining Pearl, Legends: Arceus, Scarlet/Violet e
 * Legends: Z-A movem nos dois sentidos. FireRed/LeafGreen do Switch ainda não
 * aparecem nessa página: a conexão entrou no HOME 4.1.0, de 2026-10-07, e o
 * anúncio diz que é só de ida e que nada de outro jogo entra neles.
 *
 * **Nenhum valor daqui é preenchido de memória.** Atualização do HOME muda
 * isso (o FireRed mostrou), e o valor mora neste lugar só.
 *
 * Fora da lista, por ora: os jogos de 3DS (chegam ao HOME pelo Pokémon Bank,
 * só de ida), os cartuchos de GBA e DS, e o Pokémon Champions, que recebe
 * Pokémon em visita mas não é fonte de captura. Entram quando houver um.
 */

export type ConexaoHome = "ida_e_volta" | "so_envio";

export interface JogoDex {
  id: string;
  nome: string;
  plataforma: "switch" | "celular";
  geracao: number;
  conexaoHome: ConexaoHome;
}

/** Na ordem de lançamento, que é a ordem de exibição. */
export const JOGOS_DEX: readonly JogoDex[] = [
  { id: "firered", nome: "Pokémon FireRed", plataforma: "switch", geracao: 3, conexaoHome: "so_envio" },
  { id: "leafgreen", nome: "Pokémon LeafGreen", plataforma: "switch", geracao: 3, conexaoHome: "so_envio" },
  { id: "go", nome: "Pokémon GO", plataforma: "celular", geracao: 0, conexaoHome: "so_envio" },
  { id: "lets-go-pikachu", nome: "Pokémon: Let's Go, Pikachu!", plataforma: "switch", geracao: 7, conexaoHome: "ida_e_volta" },
  { id: "lets-go-eevee", nome: "Pokémon: Let's Go, Eevee!", plataforma: "switch", geracao: 7, conexaoHome: "ida_e_volta" },
  { id: "sword", nome: "Pokémon Sword", plataforma: "switch", geracao: 8, conexaoHome: "ida_e_volta" },
  { id: "shield", nome: "Pokémon Shield", plataforma: "switch", geracao: 8, conexaoHome: "ida_e_volta" },
  { id: "brilliant-diamond", nome: "Pokémon Brilliant Diamond", plataforma: "switch", geracao: 8, conexaoHome: "ida_e_volta" },
  { id: "shining-pearl", nome: "Pokémon Shining Pearl", plataforma: "switch", geracao: 8, conexaoHome: "ida_e_volta" },
  { id: "legends-arceus", nome: "Pokémon Legends: Arceus", plataforma: "switch", geracao: 8, conexaoHome: "ida_e_volta" },
  { id: "scarlet", nome: "Pokémon Scarlet", plataforma: "switch", geracao: 9, conexaoHome: "ida_e_volta" },
  { id: "violet", nome: "Pokémon Violet", plataforma: "switch", geracao: 9, conexaoHome: "ida_e_volta" },
  { id: "legends-za", nome: "Pokémon Legends: Z-A", plataforma: "switch", geracao: 9, conexaoHome: "ida_e_volta" },
];

/** O HOME como local de um registro. Não é um jogo do catálogo. */
export const LOCAL_HOME = "home";

const JOGO_POR_ID = new Map(JOGOS_DEX.map((j) => [j.id, j]));

export function jogoDex(id: string): JogoDex | undefined {
  return JOGO_POR_ID.get(id);
}

export function ehJogoDex(id: unknown): id is string {
  return typeof id === "string" && JOGO_POR_ID.has(id);
}

/** Ordem de exibição de um jogo (lançamento); desconhecido vai para o fim. */
export function ordemJogo(id: string): number {
  const i = JOGOS_DEX.findIndex((j) => j.id === id);
  return i < 0 ? JOGOS_DEX.length : i;
}
