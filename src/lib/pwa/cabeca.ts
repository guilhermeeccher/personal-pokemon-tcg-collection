import type { Metadata, Viewport } from "next";

import { NOME_CURTO_APP } from "./identidade";

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
   exatamente o de antes do módulo. Sem `themeColor` (o Safari do Mac tingiria
   a janela) e sem as convenções `app/icon.png`/`app/apple-icon.png`, que
   inserem metadados sempre e trocariam o favicon. `icons` só leva `apple`: o
   favicon continua sendo o `favicon.ico` do app, que o Next acrescenta à
   parte. */
export function metadadosPwa(acessoLigado: boolean): Metadata {
  if (!acessoLigado) return {};
  return {
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: NOME_CURTO_APP, statusBarStyle: "default" },
    icons: { apple: [{ url: "/pwa/icone-180.png", sizes: "180x180", type: "image/png" }] },
  };
}

/* `viewportFit: "cover"` deixa a página ocupar a tela inteira do iPhone (sob o
   entalhe), e o CSS de cada versão devolve as margens com
   `env(safe-area-inset-*)` em `[data-pwa]`. Só com o módulo ligado; desligado
   devolve `{}`, o que mantém o `<meta name="viewport">` padrão de sempre. */
export function viewportPwa(acessoLigado: boolean): Viewport {
  return acessoLigado ? { viewportFit: "cover" } : {};
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
