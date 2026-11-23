/**
 * Os destinos das telas da Dex na v2, com as chaves de query que a v1 lê
 * (`?busca=` no cadastro, `?jogo=` nos troféus): enquanto a tela de destino é
 * ponte, o 307 leva a query intacta para `/v1`; quando ela chegar à v2, o link
 * já está certo (README da v2, "Bridge pages").
 */

/** O cadastro com a busca pelo número nacional, como a Pokédex e a visão geral da v1. */
export function hrefCadastroDex(numero: number): string {
  return `/dex/cadastrar?busca=${numero}`;
}

/** Os troféus de um jogo, ou do HOME (`JOGO_HOME`). */
export function hrefTrofeus(jogoId: string): string {
  return `/dex/trofeus?jogo=${encodeURIComponent(jogoId)}`;
}
