/**
 * Identidade do app instalado, compartilhada pelo manifesto e pelo
 * `layout.tsx`. Fica fora do `route.ts` porque o Next recusa, num arquivo de
 * rota, qualquer export que não seja um campo reconhecido.
 */

/* Os dois rótulos do app na tela de início. O `NOME_CURTO_APP` também é o
   título do `appleWebApp`. Ficam juntos para trocar de uma vez se o rótulo
   não couber ou não agradar no aparelho. */
export const NOME_APP = "Coleção Pokémon";
export const NOME_CURTO_APP = "Coleção";

/* Cores do design system (`src/app/tokens/colors.css`), em hex literal porque
   o manifesto não resolve `var()`:
   - fundo = `--surface-canvas` (`--paper-2`), o papel creme da página, que é
     o que aparece na abertura do app antes da primeira tela;
   - tema = `--surface-shell` (`--ink-2`), a ameixa do cabeçalho do celular. */
export const COR_FUNDO = "#FDF5E7";
export const COR_TEMA = "#2A2036";
