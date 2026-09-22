import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, resolveLocale } from "./config";

/**
 * Ponte entre a resolução de idioma (`config.ts`) e o `next-intl`.
 *
 * Ler cookie e cabeçalho aqui faz toda página passar a ser renderizada sob
 * demanda, em vez de gerada no build. Não há custo real nisso: as telas
 * deste sistema leem o banco a cada visita de qualquer forma, e nenhuma
 * delas era estática antes.
 *
 * Os catálogos são importados por `import()` dinâmico para que a tradução
 * que não está em uso não entre no bundle da resposta.
 */
export default getRequestConfig(async () => {
  const [cookieStore, cabecalhos] = await Promise.all([cookies(), headers()]);

  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    cabecalhos.get("accept-language"),
  );

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
