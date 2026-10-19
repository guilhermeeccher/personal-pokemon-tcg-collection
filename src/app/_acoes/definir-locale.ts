"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "@/i18n/config";
import { exigirSessaoNaAcao } from "@/lib/acesso";

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
 * O cookie **não** é `httpOnly`: é preferência de interface, não credencial.
 * Quem autentica, quando o acesso opcional por senha está ligado
 * (`ACESSO_COM_SENHA=1`), é o cookie de sessão, à parte; desligado, o app
 * continua sem autenticação nenhuma, como sempre.
 * Valor desconhecido é ignorado em silêncio; quem resolve o idioma de fato
 * é `resolveLocale`, que já trata cookie inválido como ausente.
 *
 * `exigirSessaoNaAcao()` vem antes de tudo: uma server action é um `POST`
 * que qualquer página pode disparar, e com o módulo ligado ela exige
 * sessão **e** origem permitida. Desligado, a guarda volta sem ler nada.
 * Por isso a tela de login não oferece a troca de idioma: sem sessão, esta
 * action recusa.
 */
export async function definirLocale(locale: Locale): Promise<void> {
  await exigirSessaoNaAcao();
  if (!isLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
