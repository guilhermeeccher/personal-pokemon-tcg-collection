"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "@/i18n/config";

/**
 * Grava o idioma escolhido no cookie que `i18n/request.ts` lê.
 *
 * É uma server action, e não uma escrita em `document.cookie` no cliente,
 * por um motivo só: quase toda tela deste sistema é componente de servidor,
 * então a troca de idioma precisa chegar ao servidor antes de a página ser
 * remontada. O `revalidatePath` com escopo de layout derruba o cache de
 * rota inteiro — sem ele, uma tela já visitada voltaria do cache no idioma
 * anterior.
 *
 * O cookie **não** é `httpOnly`: é preferência de interface, não credencial
 * (esta app não tem autenticação nenhuma — decisão de stack do AGENTS.md).
 * Valor desconhecido é ignorado em silêncio; quem resolve o idioma de fato
 * é `resolveLocale`, que já trata cookie inválido como ausente.
 */
export async function definirLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
