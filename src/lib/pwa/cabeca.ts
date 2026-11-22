import type { Metadata, Viewport } from "next";

import { COR_TEMA, NOME_CURTO_APP } from "./identidade";

/** Qual dos dois layouts raiz está pedindo a cabeça. */
export type VersaoInterface = "v1" | "v2";

/**
 * O que o PWA põe no `<head>` e no `<html>`, compartilhado pelos dois layouts
 * raiz: o da v1 (`src/app/(v1)/layout.tsx`) e o da v2
 * (`src/app/(v2)/layout.tsx`). Desde 2026-11-22 o app tem dois layouts raiz,
 * um por versão, e a página da v2 precisa do mesmo manifesto, do mesmo ícone
 * e do mesmo `viewport-fit` que a da v1 — senão o app instalado perde o
 * manifesto ao abrir uma tela da v2. Uma função só, para os dois não
 * divergirem.
 *
 * Tudo aqui depende só de o módulo de acesso estar ligado, que o layout lê por
 * requisição (o `.env` não existe no build) e passa como argumento: a função é
 * pura e testada sem servidor.
 */

/* Só com o módulo ligado. Desligado, devolve nada, e o `<head>` fica
   exatamente o de antes do módulo. Sem as convenções
   `app/icon.png`/`app/apple-icon.png`, que inserem metadados sempre e
   trocariam o favicon. `icons` só leva `apple`: o favicon continua sendo o
   `favicon.ico` do app, que o Next acrescenta à parte.

   A barra de status do app instalado no iPhone muda com a versão
   (2026-11-22): a v1 é clara e fica com `default` (barra branca, texto
   preto, a página começa abaixo dela); a v2 é escura e usa
   `black-translucent` (texto branco, a página passa por baixo da barra), o
   que só funciona porque a v2 sempre devolve a área segura de cima
   (`viewport-fit=cover` sempre, `env(safe-area-inset-top)` na casca). O iOS
   lê o valor da página que abre, então cada layout manda o seu. */
export function metadadosPwa(acessoLigado: boolean, versao: VersaoInterface = "v1"): Metadata {
  if (!acessoLigado) return {};
  return {
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: NOME_CURTO_APP,
      statusBarStyle: versao === "v2" ? "black-translucent" : "default",
    },
    icons: { apple: [{ url: "/pwa/icone-180.png", sizes: "180x180", type: "image/png" }] },
  };
}

/* Viewport da v1. `viewportFit: "cover"` deixa a página ocupar a tela
   inteira do iPhone (sob o entalhe), e o `globals.css` da v1 devolve as
   margens com `env(safe-area-inset-*)` em `[data-pwa]`. Só com o módulo
   ligado; desligado devolve `{}`, o que mantém o `<meta name="viewport">`
   padrão de sempre. Sem `themeColor`: o Safari do Mac tingiria a janela da
   v1, que é clara. */
export function viewportPwa(acessoLigado: boolean): Viewport {
  return acessoLigado ? { viewportFit: "cover" } : {};
}

/* Viewport da v2, igual com o módulo ligado ou desligado (decisão 9 de
   2026-11-22):
   - `viewportFit: "cover"` sempre. A barra de abas flutua sobre a área segura
     de baixo também no Safari comum (o iPhone deitado tem entalhe dos lados),
     então as áreas seguras da v2 são regras da casca, não do `[data-pwa]`.
     O que continua condicional ao acesso por senha é o PWA de fato:
     manifesto, ícones e metadados Apple (`metadadosPwa`).
   - `themeColor` escuro, a cor do fundo: na v2, que só tem tema escuro,
     tingir a janela do Safari no Mac e a barra do Chrome no Android com o
     fundo da página é o que se quer (na v1 clara não era).
   - `colorScheme: "dark"`: o navegador desenha a barra de rolagem e os
     controles nativos no escuro desde o primeiro byte. */
export function viewportV2(): Viewport {
  return { viewportFit: "cover", themeColor: COR_TEMA, colorScheme: "dark" };
}

/* O atributo que ativa as áreas seguras do CSS. Espalhado no `<html>`, e não
   `data-pwa={undefined}`, para que nem o payload do React carregue o nome do
   atributo quando desligado. */
export function atributosHtmlPwa(acessoLigado: boolean): { "data-pwa"?: "" } {
  return acessoLigado ? { "data-pwa": "" } : {};
}

/* Depois de "Sair", voltar no histórico não pode mostrar a página tirada do
   cache de histórico do navegador (bfcache): `persisted` é o sinal dessa
   restauração, e o reload passa pelo proxy, que manda ao login. */
export const SCRIPT_BFCACHE = 'addEventListener("pageshow",function(e){if(e.persisted)location.reload();});';
