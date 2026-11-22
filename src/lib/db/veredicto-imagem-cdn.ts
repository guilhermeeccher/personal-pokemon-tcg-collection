import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { cartaCatalogo } from "./schema";

type Expressao = AnyPgColumn | SQL;

/**
 * O veredito do CDN (`imagem_cdn_existe`) aplicado a `imagem_url`, num lugar
 * só: quem lê a URL do catálogo e quem a grava.
 *
 * ## Leitura: URL verificada como ausente não é foto
 *
 * Até 2026-11-22 a cadeia de imagem (`degrausImagem`, em
 * `lib/db/consultas.ts`) confiava em `imagem_url` às cegas. O catálogo pode
 * trazer URL para um arquivo que o CDN não tem, e a tela mostrava imagem
 * quebrada em vez de cair no degrau seguinte. `pnpm verificar:imagens-cdn
 * --com-url` passou a verificar a URL gravada; com `false`, ela some da
 * cadeia. `true` e `null` (não verificada) seguem exatamente como antes —
 * o padrão continua sendo confiar na URL que o upstream publicou.
 */
export function urlCatalogoNaoAusente(url: Expressao, existe: Expressao): SQL {
  return sql`(case when ${existe} is distinct from false then ${url} end)`;
}

export interface PartesUrlImagem {
  imagemUrl: Expressao;
  idioma: Expressao;
  setSerieId: Expressao;
  setId: Expressao;
  localId: Expressao;
}

/**
 * A URL do CDN deduzida de idioma/série/set/número — o mesmo padrão de
 * `urlBaseImagemCartaCdn` (`lib/dominio/imagem-carta.ts`, o certo em caso
 * de divergência), em SQL. Sem `set_serie_id`, nula. Os degraus 4 e 6 da
 * cadeia de imagem a usam também, para não haver duas montagens.
 */
export function urlDeduzidaImagem(p: Omit<PartesUrlImagem, "imagemUrl">): SQL {
  return sql`(case
      when ${p.setSerieId} is not null then
        'https://assets.tcgdex.net/'
        || case when ${p.idioma} = 'jp' then 'ja' else ${p.idioma}::text end
        || '/' || ${p.setSerieId} || '/' || ${p.setId} || '/' || ${p.localId}
    end)`;
}

/**
 * A URL que um veredito descreve: a gravada, ou a deduzida quando não há
 * gravada — exatamente o que `verificar:imagens-cdn` consulta em cada modo
 * (`urlBaseParaVerificar`).
 */
export function urlEfetivaImagem(p: PartesUrlImagem): SQL {
  return sql`coalesce(${p.imagemUrl}, ${urlDeduzidaImagem(p)})`;
}

/** As colunas da própria linha, lidas antes da escrita. */
const LINHA_ATUAL: PartesUrlImagem = {
  imagemUrl: cartaCatalogo.imagemUrl,
  idioma: cartaCatalogo.idioma,
  setSerieId: cartaCatalogo.setSerieId,
  setId: cartaCatalogo.setId,
  localId: cartaCatalogo.localId,
};

/**
 * ## Gravação: URL efetiva nova, veredito zerado
 *
 * O veredito fala de UM arquivo. Quando uma escrita muda a URL efetiva de
 * uma linha, um "ausente" antigo esconderia a URL nova sem que ninguém a
 * tivesse verificado — e o caso típico é justamente o upstream corrigindo
 * uma URL quebrada. Então, na mesma escrita, URL efetiva diferente zera as
 * duas colunas (a linha volta para a fila do `verificar:imagens-cdn`), e a
 * mesma URL efetiva mantém o veredito.
 *
 * Efetiva, e não só `imagem_url`: numa linha sem URL gravada o veredito
 * fala da URL deduzida, e um `set_serie_id`, `set_id` ou `local_id`
 * corrigido muda o arquivo sem mudar `imagem_url` (nulo → nulo).
 *
 * `nova` descreve o que a escrita grava (o importador do repositório grava
 * `coalesce(excluded.imagem_url, atual)`; o toque do set inalterado, só a
 * série). A comparação é com a linha de antes: no `ON CONFLICT DO UPDATE` e
 * no `UPDATE ... SET`, toda referência à tabela lê a linha antiga, então a
 * ordem das colunas no `set` não importa. `is distinct from` para que nulo
 * → URL e URL → nulo também contem como troca.
 *
 * Vale para todo escritor de `imagem_url` ou das partes da URL deduzida: o
 * sync (upsert e toque), o importador do repositório e o seed. O par que o
 * arquivo do seed traz entra só no INSERT; num conflito vale esta regra,
 * como para os outros.
 */
export function vereditoCdnAoGravar(nova: PartesUrlImagem): {
  imagemCdnExiste: SQL;
  imagemCdnVerificadoEm: SQL;
} {
  const trocou = sql`${urlEfetivaImagem(nova)} is distinct from ${urlEfetivaImagem(LINHA_ATUAL)}`;
  return {
    imagemCdnExiste: sql`case when ${trocou} then null else ${cartaCatalogo.imagemCdnExiste} end`,
    imagemCdnVerificadoEm: sql`case when ${trocou} then null else ${cartaCatalogo.imagemCdnVerificadoEm} end`,
  };
}

/** As partes da URL vindas do `excluded` de um upsert, com a URL gravada dada. */
export function partesDoExcluded(imagemUrl: SQL = sql`excluded.imagem_url`): PartesUrlImagem {
  return {
    imagemUrl,
    idioma: sql`excluded.idioma`,
    setSerieId: sql`excluded.set_serie_id`,
    setId: sql`excluded.set_id`,
    localId: sql`excluded.local_id`,
  };
}
