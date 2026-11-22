import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

import { ScriptBfcache, metadadosDoApp, viewportDoApp } from "@/app/_comum/cabeca";
import { Nav } from "@/app/_componentes/nav";
import { TopBar } from "@/app/_componentes/topbar";
import { moduloAcessoLigado } from "@/lib/dominio/acesso/configuracao";
import { moduloLivingDexAtivo } from "@/lib/modulos";
import { atributosHtmlPwa } from "@/lib/pwa/cabeca";

/*
 * Layout raiz da v1. Desde 2026-11-22 o app tem dois layouts raiz, por route
 * group: este, com as telas da v1 em `/v1/...` e o login, e o da v2
 * (`src/app/(v2)/layout.tsx`), na raiz. Trocar de layout raiz é uma carga de
 * documento nova, e é isso que isola a pele: esta folha (`globals.css` e
 * `tokens/`) nunca está no mesmo documento que a da v2, e nenhuma classe da
 * v1 precisou mudar. O DOM daqui é o mesmo de antes da mudança — as regras de
 * área segura do `globals.css` (`body > header|nav|div`) dependem dele.
 */

/*
 * As tres familias do design system, hospedadas no proprio build pelo
 * next/font (o design system carregava por @import do Google Fonts; CDN em
 * runtime seria dependencia externa desnecessaria num app de rede local).
 *
 * Display arredondada para titulo e numero grande; humanista quente para a
 * interface; mono tabular para toda contagem, preco e percentual — a voz
 * "tecnica" deliberada contra a face redonda.
 */
const fonteDisplay = Baloo_2({
  variable: "--fonte-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const fonteSans = Nunito({
  variable: "--fonte-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fonteMono = IBM_Plex_Mono({
  variable: "--fonte-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/* PWA (manifesto, metadados Apple, `viewport-fit`): só com o módulo de acesso
   ligado, e igual nos dois layouts raiz — a decisão mora em
   `lib/pwa/cabeca.ts`. */
export async function generateMetadata(): Promise<Metadata> {
  return metadadosDoApp();
}

export function generateViewport(): Viewport {
  return viewportDoApp();
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /* `lang` tem que acompanhar o idioma resolvido, senão leitor de tela e
     corretor do navegador continuam tratando a página como português. */
  const locale = await getLocale();
  /* Lida a cada requisição, como a flag da Living Dex: o `.env` não existe
     no build, e a `Nav` é de cliente. */
  const acessoComSenha = moduloAcessoLigado(process.env);

  return (
    <html
      lang={locale}
      /* Só com o módulo ligado: é o que ativa as áreas seguras do
         `globals.css`. Desligado, o atributo não existe e nenhuma regra nova
         se aplica. */
      {...atributosHtmlPwa(acessoComSenha)}
      className={`${fonteDisplay.variable} ${fonteSans.variable} ${fonteMono.variable} h-full antialiased`}
    >
      {/*
        Shell do design system: a lombada e a barra superior ficam paradas,
        e so a area de conteudo rola. O `overflow-hidden` do body vale so do
        `md` para cima — no mobile a pagina inteira rola normalmente, com o
        header da Nav no topo, como sempre foi.
      */}
      <body className="flex min-h-full flex-col font-sans md:h-full md:flex-row md:overflow-hidden">
        {/* O provider entrega locale e catálogo aos componentes de cliente;
            em componente de servidor eles já vêm do `getRequestConfig`. */}
        <NextIntlClientProvider>
          {/* A flag é lida aqui, no servidor, a cada requisição — a Nav é
              componente de cliente e não enxerga o `.env`. */}
          <Nav livingDex={moduloLivingDexAtivo()} acessoComSenha={acessoComSenha} />
          <div className="flex min-w-0 flex-1 flex-col md:h-full">
            <TopBar />
            <div className="min-h-0 flex-1 md:overflow-y-auto">{children}</div>
          </div>
        </NextIntlClientProvider>
        {/* Só com o módulo ligado. Depois de "Sair", voltar no histórico não
            pode mostrar a página tirada do cache de histórico do navegador
            (bfcache): `persisted` é o sinal dessa restauração, e o reload
            passa pelo proxy, que manda ao login. Desligado, nenhum script. */}
        {acessoComSenha && <ScriptBfcache />}
      </body>
    </html>
  );
}
