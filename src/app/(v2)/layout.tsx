import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./v2.css";

import { ScriptBfcache, metadadosDoApp, viewportDoApp } from "@/app/_comum/cabeca";
import { moduloAcessoLigado } from "@/lib/dominio/acesso/configuracao";
import { atributosHtmlPwa } from "@/lib/pwa/cabeca";

/*
 * Layout raiz da v2, na raiz do site (2026-11-22). A v1 tem o seu, em
 * `src/app/(v1)/layout.tsx`, com as telas em `/v1/...`; ir de um ao outro é
 * uma carga de documento nova, que é o que mantém a pele creme da v1 longe
 * desta. Enquanto uma tela não existe na v2, o lugar dela é uma página-ponte
 * (`_ponte/ir-para-v1.ts`) que redireciona para a mesma tela em `/v1`.
 *
 * Por ora é só o esqueleto, e ele já carrega o que não pode faltar em nenhuma
 * página da v2:
 * - o idioma resolvido no `lang` e o provider do next-intl, como na v1;
 * - os metadados e o viewport do PWA e o `data-pwa`, os mesmos da v1 (só com o
 *   acesso por senha ligado): sem eles, o app instalado perde o manifesto ao
 *   abrir uma tela da v2;
 * - o script do bfcache, sem o qual "Sair" seguido de "Voltar" mostraria uma
 *   página da v2 tirada do cache.
 */

export async function generateMetadata(): Promise<Metadata> {
  return metadadosDoApp();
}

export function generateViewport(): Viewport {
  return viewportDoApp();
}

export default async function LayoutV2({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  /* Lida a cada requisição: o `.env` não existe no build. */
  const acessoComSenha = moduloAcessoLigado(process.env);

  return (
    <html lang={locale} {...atributosHtmlPwa(acessoComSenha)}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {acessoComSenha && <ScriptBfcache />}
      </body>
    </html>
  );
}
