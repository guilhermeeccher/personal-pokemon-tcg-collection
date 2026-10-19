import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

import { moduloAcessoLigado } from "@/lib/dominio/acesso/configuracao";
import { moduloLivingDexAtivo } from "@/lib/modulos";
import { NOME_CURTO_APP } from "@/lib/pwa/identidade";

import { Nav } from "./_componentes/nav";
import { TopBar } from "./_componentes/topbar";

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const base: Metadata = {
    title: t("titulo"),
    description: t("descricao"),
  };
  /* PWA: só com o módulo de acesso ligado (a flag é lida por requisição, o
     `.env` não existe no build). Desligado, devolve exatamente o de antes e o
     `<head>` não muda. Sem `themeColor` (o Safari do Mac tingiria a janela) e
     sem as convenções `app/icon.png`/`app/apple-icon.png`, que inserem
     metadados sempre e trocariam o favicon. `icons` só leva `apple`: o
     favicon continua sendo o `favicon.ico` do app, que o Next acrescenta à
     parte. */
  if (!moduloAcessoLigado(process.env)) return base;
  return {
    ...base,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: NOME_CURTO_APP, statusBarStyle: "default" },
    icons: { apple: [{ url: "/pwa/icone-180.png", sizes: "180x180", type: "image/png" }] },
  };
}

/* `viewportFit: "cover"` deixa a página ocupar a tela inteira do iPhone (sob o
   entalhe), e o `globals.css` devolve as margens com `env(safe-area-inset-*)`
   em `[data-pwa]`. Só com o módulo ligado; desligado devolve `{}`, o que
   mantém o `<meta name="viewport">` padrão de sempre. */
export function generateViewport(): Viewport {
  return moduloAcessoLigado(process.env) ? { viewportFit: "cover" } : {};
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
         se aplica. Espalhado, e não `data-pwa={undefined}`, para que nem o
         payload do React carregue o nome do atributo quando desligado. */
      {...(acessoComSenha ? { "data-pwa": "" } : {})}
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
        {acessoComSenha && (
          <script
            dangerouslySetInnerHTML={{
              __html: 'addEventListener("pageshow",function(e){if(e.persisted)location.reload();});',
            }}
          />
        )}
      </body>
    </html>
  );
}
