/**
 * Fallback de imagem de carta no CDN da TCGdex (`assets.tcgdex.net`) para
 * quando `carta_catalogo.imagem_url` vier nulo.
 *
 * ESTADO EM 2026-08-29: sem chamador em runtime. A escolha de qual
 * imagem exibir passou a ser resolvida em SQL (`imagemDaCarta`, em
 * `lib/db/consultas.ts`), que monta esta mesma URL inline e só para o
 * japonês. O módulo fica porque é aqui que o PADRÃO do path está
 * especificado e testado — caixa preservada, zero à esquerda
 * preservado — e porque o script de verificação do CDN vai montar as
 * URLs por aqui. Se o SQL e este arquivo divergirem, este é o certo.
 *
 * Contexto (medido carta a carta em 2026-08-26 contra o CDN): 2.686 linhas do catálogo têm `imagem_url` nulo
 * porque a API TCGdex (`api.tcgdex.net` — host bloqueado para o IP deste
 * servidor desde 2026-08-25, NUNCA chamar) não devolveu o campo `image`
 * para elas. Mas o CDN de assets é um host separado, sem bloqueio, e em
 * parte dos casos o arquivo existe lá mesmo assim. O padrão de path,
 * confirmado contra as linhas que já têm imagem:
 *
 *   https://assets.tcgdex.net/{idioma}/{serieId}/{setId}/{localId}/{qualidade}.{extensao}
 *
 * Este módulo monta só a parte nova do path — idioma + serieId + setId +
 * localId — e devolve a URL BASE, sem sufixo de qualidade/extensão, no
 * mesmo formato em que `carta_catalogo.imagem_url` já é gravado pelo
 * sync. Isso deixa reaproveitar `urlImagemCarta` (`lib/imagens.ts`) sem
 * duplicar a lógica de qualidade/extensão (`low.webp`/`high.webp`, já
 * testados e equivalentes a `.png` para as cartas onde o arquivo existe).
 */

import type { Idioma } from "./enums";

/**
 * Tradução do idioma para o código usado no path do CDN. Mesma regra do
 * host da API (`codigoIdiomaUpstream` em `lib/sync/tcgdex.ts`): o enum
 * de banco usa `jp`, o upstream usa o ISO `ja` — confirmado ao vivo para
 * o CDN também (`https://assets.tcgdex.net/ja/SM/SM3H/009/high.png` →
 * 200, carta japonesa real).
 *
 * Duplicada aqui em vez de importada de `lib/sync/tcgdex.ts` de
 * propósito: `lib/sync/` está sob edição concorrente por outra frente
 * agora (fora de escopo desta tarefa), e este módulo de domínio deve
 * ficar puro e independente dele. Se as duas regras divergirem no
 * futuro, é sinal de que a tradução de idioma merece um lugar
 * compartilhado — não duplicar cegamente de novo.
 */
function codigoIdiomaCdn(idioma: Idioma): string {
  return idioma === "jp" ? "ja" : idioma;
}

export interface ChaveImagemCartaCdn {
  idioma: Idioma | null | undefined;
  /**
   * Id da série (ex.: `sm`, `sv`, ou `SM` em maiúsculas no catálogo
   * japonês) — NÃO é `carta_catalogo.set_serie` (nome da série, ex.:
   * "Escuridão Incandescente"). Hoje não existe coluna para isso no
   * banco; está sendo criada (`set_serie_id`) por outra frente em
   * paralelo. Até a costura, todo chamador passa `null`/`undefined`
   * aqui e esta função sempre devolve `null` — sem fallback, tela
   * idêntica à de hoje.
   */
  setSerieId: string | null | undefined;
  /** `carta_catalogo.set_id` — já existe e já é usado hoje. */
  setId: string | null | undefined;
  /** `carta_catalogo.local_id` — entra exatamente como gravado. */
  localId: string | null | undefined;
}

/**
 * Monta a URL base da imagem de carta no CDN da TCGdex, ou `null` quando
 * não há dado suficiente para montar (faltando qualquer uma das quatro
 * partes — o caso mais comum hoje é a ausência de `setSerieId`).
 *
 * Regras deliberadas, cobertas por teste:
 * - Nunca normaliza caixa: o catálogo japonês usa serie/set em
 *   maiúsculas (`SM`/`SM3H`), o ocidental em minúsculas (`sm`/`sv03.5`
 *   etc.) — a URL só funciona com a caixa exata do upstream.
 * - Preserva zeros à esquerda do `localId` (`009`, `SWSH032`) — string,
 *   nunca passa por `Number`.
 * - Não valida se a carta de fato existe no CDN (isso só se sabe com a
 *   requisição HTTP em si, feita pelo `<img>` no componente de
 *   exibição) — aqui é só montagem de URL, sem rede.
 */
export function urlBaseImagemCartaCdn({
  idioma,
  setSerieId,
  setId,
  localId,
}: ChaveImagemCartaCdn): string | null {
  if (!idioma || !setSerieId || !setId || !localId) return null;
  return `https://assets.tcgdex.net/${codigoIdiomaCdn(idioma)}/${setSerieId}/${setId}/${localId}`;
}
