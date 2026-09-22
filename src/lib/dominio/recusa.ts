/**
 * Recusa: o contrato entre o servidor e a tela quando uma operação é
 * negada.
 *
 * O servidor devolve uma CHAVE estável (`copiaJaAlocada`) e, quando a
 * recusa carrega dado, os valores para interpolação — nunca a frase. A
 * frase é montada na borda do componente, pelo `next-intl`, no idioma
 * da interface de quem está olhando (`src/i18n/config.ts`). Antes disto
 * as rotas devolviam a frase pronta em português, e a interface em
 * inglês exibia português na primeira recusa real que aparecia.
 *
 * Por que chave e não a frase traduzida no servidor: o idioma da
 * interface vive num cookie do navegador, e a mesma rota serve a
 * exportação e o `fetch` da tela. Uma frase escolhida no servidor
 * obrigaria a rota a saber quem pergunta; a chave não obriga a nada —
 * ela é um identificador, e quem a resolve é quem sabe em que língua
 * está falando.
 *
 * Por que `valores` e não concatenação: `"vaga " + chave` não tem como
 * virar outra ordem de palavras em outra língua, e número de vaga,
 * idioma e nome de carta entram no meio da frase em posições que mudam
 * com o idioma. Com ICU (`{vaga}`) o catálogo decide onde o dado entra.
 *
 * Nem toda recusa vira chave. Guarda de corpo malformado (`"Corpo
 * inválido (JSON esperado)."`, `"copiaId ausente ou vazio."` e
 * companhia) só dispara para requisição que a interface não tem como
 * emitir — ninguém lê aquilo na tela, e uma chave ali seria catálogo
 * morto. Essas continuam em `erro`, em português, como estavam.
 */

/**
 * Valores de interpolação. **Só texto, inclusive para número** — e isso
 * é deliberado. O ICU formata argumento numérico pela localidade, então
 * um `{maximo}` valendo 1025 sairia "1,025" em inglês e "1.025" em
 * português, enquanto a frase que existe hoje diz "1025". Contagem e
 * número de Pokédex aqui são identificador dentro da frase, não
 * quantidade a ser formatada; quem chama converte com `String()` e o
 * texto sai idêntico nos dois idiomas.
 */
export type ValoresDeRecusa = Record<string, string>;

export interface Recusa {
  /** Chave dentro do namespace `recusas` dos catálogos de mensagem. */
  chave: string;
  valores?: ValoresDeRecusa;
}

export function recusa(chave: string, valores?: ValoresDeRecusa): Recusa {
  return valores === undefined ? { chave } : { chave, valores };
}

/**
 * O corpo JSON de uma resposta de recusa, a partir da chave.
 *
 * Campo próprio (`recusa`), e não o `erro` de sempre: as rotas que
 * seguem em português continuam mandando `erro`, e a tela sabe
 * distinguir as duas sem adivinhar se a string que chegou é uma chave
 * ou uma frase.
 */
export function corpoRecusa(chave: string, valores?: ValoresDeRecusa): { recusa: Recusa } {
  return { recusa: recusa(chave, valores) };
}

/** O mesmo, a partir de uma recusa que o domínio já montou. */
export function corpoDaRecusa(r: Recusa): { recusa: Recusa } {
  return { recusa: r };
}

/** Lista de recusas — validação de formulário, onde todos os erros vão juntos. */
export function corpoDasRecusas(rs: readonly Recusa[]): { recusas: Recusa[] } {
  return { recusas: [...rs] };
}
