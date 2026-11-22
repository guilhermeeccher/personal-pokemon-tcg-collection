import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./v2.css";

import { ScriptBfcache, metadadosDoApp, viewportDoApp } from "@/app/_comum/cabeca";
import { moduloAcessoLigado } from "@/lib/dominio/acesso/configuracao";
import { moduloLivingDexAtivo } from "@/lib/modulos";
import { atributosHtmlPwa } from "@/lib/pwa/cabeca";

import { Casca } from "./_componentes/casca/casca";

/*
 * Layout raiz da v2, na raiz do site (2026-11-22). A v1 tem o seu, em
 * `src/app/(v1)/layout.tsx`, com as telas em `/v1/...`; ir de um ao outro é
 * uma carga de documento nova, que é o que mantém a pele creme da v1 longe
 * desta. Enquanto uma tela não existe na v2, o lugar dela é uma página-ponte
 * (`_ponte/ir-para-v1.ts`) que redireciona para a mesma tela em `/v1`.
 *
 * O que não pode faltar em nenhuma página da v2:
 * - o idioma resolvido no `lang` e o provider do next-intl;
 * - os metadados do PWA e o `data-pwa`, os mesmos da v1, só com o acesso por
 *   senha ligado — a barra de status é a escura (`metadadosDoApp("v2")`);
 * - o viewport da v2, que cobre a tela **sempre** (decisão 9), escuro;
 * - o script do bfcache, sem o qual "Sair" seguido de "Voltar" mostraria uma
 *   página da v2 tirada do cache;
 * - a casca (trilho, abas, luz ambiente, avisos), que recebe as duas flags
 *   lidas aqui, no servidor, a cada requisição: a imagem é construída sem o
 *   `.env`.
 */

/*
 * As três famílias da v2, hospedadas pelo próprio build (`next/font`): na
 * rede local o celular pode estar sem internet, e um `<link>` do Google Fonts
 * cairia em `system-ui`. Display variável com eixo óptico para título e
 * número grande; uma sans neutra para a interface; mono tabular para contagem
 * e preço.
 */
const fonteDisplay = Bricolage_Grotesque({
  variable: "--v2-f-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

const fonteUi = Instrument_Sans({
  variable: "--v2-f-ui",
  subsets: ["latin"],
});

const fonteNum = Geist_Mono({
  variable: "--v2-f-num",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  return metadadosDoApp("v2");
}

export function generateViewport(): Viewport {
  return viewportDoApp("v2");
}

export default async function LayoutV2({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const acessoComSenha = moduloAcessoLigado(process.env);

  return (
    <html
      lang={locale}
      {...atributosHtmlPwa(acessoComSenha)}
      className={`${fonteDisplay.variable} ${fonteUi.variable} ${fonteNum.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          <Casca livingDex={moduloLivingDexAtivo()} acessoComSenha={acessoComSenha}>
            {children}
          </Casca>
        </NextIntlClientProvider>
        {acessoComSenha && <ScriptBfcache />}
      </body>
    </html>
  );
}
