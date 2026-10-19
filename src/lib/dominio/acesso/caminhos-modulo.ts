/**
 * Os caminhos do acesso por senha e o 404 deles com o módulo desligado.
 *
 * Fonte única para dois leitores: o `next.config.ts`, que monta a reescrita
 * no build, e a decisão do proxy (`decisao-proxy.ts`), que marca a
 * requisição por requisição. **Sem dependência nenhuma**, de propósito: o
 * `next.config.ts` importa este arquivo, e qualquer import daqui entraria
 * no carregamento da configuração.
 *
 * Como o 404 idêntico é obtido: com o módulo desligado, o proxy marca a
 * requisição de um destes caminhos com `CABECALHO_DESLIGADO`, e a reescrita
 * `beforeFiles` do `next.config.ts` (`reescritasDoModuloDesligado`) a leva
 * para `PASTA_INEXISTENTE`. Pasta com `_` na frente é privada no App
 * Router, nunca roteia, e a resposta é o 404 do próprio Next — o mesmo de
 * antes do módulo, em qualquer método.
 *
 * Por que não `NextResponse.rewrite` no proxy: o Next põe
 * `x-middleware-rewrite` (com host e porta internos) em toda resposta
 * reescrita pelo proxy e passa os nomes de cabeçalho a minúsculas — medido
 * no 16.3, 30 de 30 respostas diferentes da referência. A reescrita de
 * configuração não deixa rastro.
 *
 * A reescrita vale **só para estes caminhos**: o marcador vindo de fora
 * numa rota que já existia não muda nada nela.
 */

/** As rotas sem segmento dinâmico, e a página de login. */
export const CAMINHOS_EXATOS_DO_MODULO = [
  "/login",
  "/api/sessao",
  "/api/saude",
  "/robots.txt",
  "/manifest.webmanifest",
] as const;

/** As rotas com segmento dinâmico: o prefixo e tudo abaixo dele
 *  (`/pwa/[arquivo]`, os ícones do PWA). */
export const PREFIXOS_DO_MODULO = ["/pwa"] as const;

/** O marcador que o proxy põe com o módulo desligado. */
export const CABECALHO_DESLIGADO = "x-acesso-desligado";

/** O destino da reescrita: pasta privada do App Router, sempre 404. */
export const PASTA_INEXISTENTE = "/_acesso-desligado";

/** O caminho, exatamente como chega, é do módulo? Sem normalizar, porque
 *  é a mesma comparação que a reescrita do `next.config.ts` faz. */
export function ehCaminhoDoModulo(caminho: string): boolean {
  if ((CAMINHOS_EXATOS_DO_MODULO as readonly string[]).includes(caminho)) return true;
  return PREFIXOS_DO_MODULO.some((p) => caminho === p || caminho.startsWith(p + "/"));
}

/**
 * As regras `beforeFiles` do `next.config.ts`. O caminho vai no destino de
 * propósito: parâmetro não usado no destino o Next acrescenta à query, e
 * ela apareceria no payload da página de 404. E o `value: "1"` também: sem
 * valor, o Next captura o cabeçalho como parâmetro e o põe na query do
 * mesmo jeito.
 */
export function reescritasDoModuloDesligado() {
  const has = [{ type: "header" as const, key: CABECALHO_DESLIGADO, value: "1" }];
  return [
    ...CAMINHOS_EXATOS_DO_MODULO.map((caminho) => ({
      source: caminho,
      has,
      destination: PASTA_INEXISTENTE + caminho,
    })),
    ...PREFIXOS_DO_MODULO.map((prefixo) => ({
      source: `${prefixo}/:caminho*`,
      has,
      destination: `${PASTA_INEXISTENTE}${prefixo}/:caminho*`,
    })),
  ];
}
