/**
 * Identidade do app instalado, compartilhada pelo manifesto e pelos metadados
 * dos dois layouts raiz (`cabeca.ts`). Fica fora do `route.ts` porque o Next
 * recusa, num arquivo de rota, qualquer export que não seja um campo
 * reconhecido.
 */

/* Os dois rótulos do app na tela de início. O `NOME_CURTO_APP` também é o
   título do `appleWebApp`. Ficam juntos para trocar de uma vez se o rótulo
   não couber ou não agradar no aparelho. */
export const NOME_APP = "Coleção Pokémon";
export const NOME_CURTO_APP = "Coleção PKMN";

/* Cores do app instalado, em hex literal porque o manifesto não resolve
   `var()`. As duas são o fundo da v2 (`--v2-fundo` em
   `src/app/(v2)/v2.css`; um teste confere que não divergem), decisão de
   2026-11-22.

   O manifesto é um só para as duas versões, e o `start_url` é `/`, que é do
   layout da v2: enquanto a página inicial for ponte, ela redireciona para a
   v1, e a abertura escura antecede a tela creme. Ficar com o creme até a v2
   servir a raiz evitaria esse instante, mas o iOS guarda o manifesto na hora
   de instalar: quem instalasse durante a transição teria de reinstalar para
   ver o escuro. Escuro agora, então, e a v1 só perde a cor da abertura —
   nada nela muda depois que a página carrega. (Antes: fundo `#FDF5E7`, o
   papel creme da v1, e tema `#2A2036`, a ameixa do cabeçalho da v1.) */
export const COR_FUNDO = "#06070B";
export const COR_TEMA = COR_FUNDO;
