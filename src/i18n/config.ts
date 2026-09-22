/**
 * Idioma da INTERFACE — não confundir com o `idioma` do domínio.
 *
 * O enum `Idioma` de `lib/dominio/enums.ts` (`pt`/`en`/`jp`) descreve a carta
 * física e a linha de catálogo, e é dado gravado no banco (regra 7 do
 * AGENTS.md). O que está aqui é outra coisa: em que língua o site fala com
 * quem está olhando. Os dois nunca se misturam — por isso este módulo usa o
 * vocabulário de infraestrutura (`locale`), e não `idioma`.
 *
 * ## Por que cookie, e não prefixo de URL
 *
 * O caminho comum em Next.js é `/[locale]/...`, e ele foi descartado de
 * propósito: a app é de rede local, sem SEO e sem link externo, então URL
 * prefixada não compraria nada — e quebraria os favoritos já salvos, que
 * apontam para `/inventario`, `/colecoes`, `/cadastro/set`. Nenhuma rota
 * muda por causa da tradução.
 *
 * Ordem de resolução: cookie, se houver; senão negociação pelo
 * `Accept-Language` do navegador; senão `en` — o repositório é público e
 * internacional, e quem chega sem preferência declarada lê inglês.
 */

export const LOCALES = ["en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Nome do cookie. É o mesmo que o `next-intl` usa por convenção. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/* Um ano. O cookie é preferência de interface, não sessão: quem trocou para
   português não quer escolher de novo a cada semana. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(valor: string | undefined | null): valor is Locale {
  return LOCALES.includes(valor as Locale);
}

/**
 * Negociação do `Accept-Language`.
 *
 * Casa por prefixo de língua, não pela etiqueta inteira: `pt-PT` e `pt` caem
 * em `pt-BR`, `en-GB` cai em `en`. É deliberadamente grosseiro — só existem
 * dois idiomas de interface, e recusar `pt-PT` porque não é `pt-BR` serviria
 * inglês a quem lê português.
 *
 * A ordem respeita o peso `q` (padrão 1, como manda o RFC 9110) e, em
 * empate, a ordem em que o cabeçalho lista. `*` é ignorado: ele significa
 * "qualquer um serve", o que é exatamente o caso em que o padrão vale.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;

  const preferencias = acceptLanguage
    .split(",")
    .map((parte, indice) => {
      const [etiqueta, ...parametros] = parte.trim().split(";");
      const q = parametros
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const peso = q === undefined ? 1 : Number.parseFloat(q);
      return {
        etiqueta: etiqueta.trim().toLowerCase(),
        peso: Number.isFinite(peso) ? peso : 0,
        indice,
      };
    })
    .filter((p) => p.etiqueta !== "" && p.etiqueta !== "*" && p.peso > 0)
    .sort((a, b) => b.peso - a.peso || a.indice - b.indice);

  for (const { etiqueta } of preferencias) {
    const prefixo = etiqueta.split("-")[0];
    const casou = LOCALES.find((l) => l.toLowerCase().split("-")[0] === prefixo);
    if (casou) return casou;
  }

  return null;
}

/** Cookie vence negociação, que vence o padrão. */
export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookie)) return cookie;
  return negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}
