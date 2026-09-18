import type { Metadata } from "next";
import { Baloo_2, Nunito, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Coleção Pokémon",
  description: "Catalogação da coleção física de cartas Pokémon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fonteDisplay.variable} ${fonteSans.variable} ${fonteMono.variable} h-full antialiased`}
    >
      {/*
        Shell do design system: a lombada e a barra superior ficam paradas,
        e so a area de conteudo rola. O `overflow-hidden` do body vale so do
        `md` para cima — no mobile a pagina inteira rola normalmente, com o
        header da Nav no topo, como sempre foi.
      */}
      <body className="flex min-h-full flex-col font-sans md:h-full md:flex-row md:overflow-hidden">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col md:h-full">
          <TopBar />
          <div className="min-h-0 flex-1 md:overflow-y-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
