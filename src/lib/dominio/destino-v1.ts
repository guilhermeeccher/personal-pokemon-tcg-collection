/**
 * Destino de uma página-ponte da v2: a mesma tela em `/v1`, com a mesma query.
 *
 * Desde 2026-11-22 a v1 mora em `/v1/...` e a v2 ocupa a raiz, tela por tela.
 * Uma tela que a v2 ainda não fez tem, no lugar dela, uma ponte que manda para
 * a da v1 — e é aqui que o endereço é montado. Favoritos e links antigos
 * (`/inventario?set=X`, `/colecoes/<id>/opcoes-compra?aba=Y`) têm que cair na
 * mesma tela, no mesmo filtro.
 *
 * - **Os segmentos vão como chegaram.** O Next 16.3 entrega os `params` de
 *   página crus, com os escapes da URL (medido em 2026-11-22: `/x/a%20b%2Fc`
 *   dá `"a%20b%2Fc"`, no `[id]` e no catch-all), e é assim que a tela da v1
 *   os recebe também. Decodificar e codificar de novo mudaria o valor que ela
 *   lê (`%2F` viraria `/`, ou `%20` viraria `%2520`). Por isso o segmento só
 *   ganha escape no que não pode ir cru num caminho (`/`, `?`, `#`, `\`,
 *   espaço, acento…), e um `%` já presente fica: com o que o Next entrega
 *   hoje, nada muda; com um valor decodificado, ele não abre outro caminho.
 * - **Segmento de pontos não sobe de pasta.** `.` e `..` — inclusive escritos
 *   `%2E`, que a URL do WHATWG também lê como ponto — vão com o ponto
 *   codificado duas vezes (`%252E`): cru, o navegador resolveria `..` e a
 *   ponte levaria a outra tela, ou à raiz. Nenhuma tela tem parâmetro feito
 *   só de pontos, e a v1 responde o 404 que daria a qualquer id inexistente.
 * - **A query sai de `searchParams`, que chega decodificado.** A
 *   reconstrução por `URLSearchParams` devolve a mesma query para quem a lê:
 *   chave repetida continua repetida (`?a=1&a=2`), `+` e `%` literais voltam
 *   codificados (`%2B`, `%25`), espaço volta como `+` e acento em UTF-8. A
 *   ordem entre chaves diferentes segue a primeira aparição de cada uma, que é
 *   como o Next monta o objeto; nenhuma tela lê a query pela ordem.
 * - **O resultado sempre começa por `/v1`**, um caminho do próprio site: não
 *   há segmento que o transforme em outro host.
 */

export type BuscaDaPonte = Readonly<Record<string, string | readonly string[] | undefined>>;

export const PREFIXO_V1 = "/v1";

/* O que pode ir cru num segmento de caminho (RFC 3986: não reservados,
   sub-delims, `:` e `@`), mais o `%` dos escapes que já vieram. */
const FORA_DO_SEGMENTO = /[^A-Za-z0-9\-._~!$&'()*+,;=:@%]/gu;
const SO_PONTOS = /^(?:\.|%2e)+$/i;

function codificarSegmento(segmento: string): string {
  if (SO_PONTOS.test(segmento)) return segmento.replace(/\.|%2e/gi, "%252E");
  return segmento.replace(FORA_DO_SEGMENTO, (c) => encodeURIComponent(c));
}

export function destinoV1(segmentos: readonly string[], busca: BuscaDaPonte = {}): string {
  const caminho = segmentos.map((s) => `/${codificarSegmento(s)}`).join("");
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca)) {
    if (valor === undefined) continue;
    for (const v of typeof valor === "string" ? [valor] : valor) query.append(chave, v);
  }
  const texto = query.toString();
  return `${PREFIXO_V1}${caminho}${texto ? `?${texto}` : ""}`;
}
