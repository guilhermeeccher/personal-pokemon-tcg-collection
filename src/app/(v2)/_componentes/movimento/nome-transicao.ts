/**
 * Nome compartilhado de View Transition para a carta que vai da grade ao
 * detalhe (e volta). Módulo puro.
 *
 * Um nome só pode existir em **um** elemento do DOM por vez: se a mesma
 * vaga aparece em dois lugares (a grade e "Quase lá"), só o par que está
 * transitando leva o nome; os outros ficam sem nome nenhum. Por isso a
 * função recebe se a carta é do par ativo e devolve `undefined` quando não
 * é.
 *
 * O nome vira `view-transition-name`, que só aceita identificador CSS, e a
 * chave de uma vaga tem barra (`30th/001`). Todo caractere fora de
 * `[A-Za-z0-9-]` — o próprio `_` inclusive — é escrito como `_<código hex>_`,
 * o que mantém diferentes os nomes de chaves diferentes (`30th/001` e
 * `30th_001` não colidem).
 */

const PREFIXO = "v2-carta-";

export function nomeTransicaoCarta(chave: string, noParAtivo: boolean): string | undefined {
  if (!noParAtivo) return undefined;
  const seguro = Array.from(chave, (c) => (/[A-Za-z0-9-]/.test(c) ? c : `_${c.codePointAt(0)?.toString(16)}_`)).join("");
  return PREFIXO + seguro;
}
