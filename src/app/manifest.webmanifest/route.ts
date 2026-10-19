/**
 * Manifesto do PWA. Só existe com `ACESSO_COM_SENHA=1` (o PWA liga junto
 * com o acesso por senha); desligado, `rotaDoModulo` responde 404.
 *
 * Route handler, e não `app/manifest.ts`, pelo mesmo motivo do
 * `robots.txt/route.ts`: o `manifest.ts` é gerado no build e fica em cache,
 * sem ler a flag por requisição. O `connection()` e o `dynamic` abaixo
 * mantêm a rota dinâmica.
 */
import { connection } from "next/server";

import { rotaDoModulo } from "@/lib/acesso";
import { ICONES_PWA } from "@/lib/dominio/acesso/rotas-publicas";
import { COR_FUNDO, COR_TEMA, NOME_APP, NOME_CURTO_APP } from "@/lib/pwa/identidade";

/* `force-dynamic` além do `connection()`: o `connection()` fica dentro do
   handler, e o envoltório responde 404 antes de chamá-lo quando o módulo
   está desligado — que é o caso no build da imagem, feito sem o `.env`.
   Conferido no 16.3: sem esta linha, o build pré-renderiza a rota com
   aquele 404 e a congela (`○` na saída do build), e ligar o módulo depois
   não a faria aparecer. */
export const dynamic = "force-dynamic";

/* O 180 é o `apple-touch-icon` do layout e não entra no manifesto. */
const [, ICONE_192, ICONE_512, ICONE_MASCAVEL_512] = ICONES_PWA;

export const GET = rotaDoModulo(async () => {
  await connection();
  const manifesto = {
    name: NOME_APP,
    short_name: NOME_CURTO_APP,
    lang: "pt-BR",
    display: "standalone",
    start_url: "/",
    scope: "/",
    background_color: COR_FUNDO,
    theme_color: COR_TEMA,
    icons: [
      { src: `/pwa/${ICONE_192}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa/${ICONE_512}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa/${ICONE_MASCAVEL_512}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  /* `no-store`: ligar e desligar o módulo vale na hora. */
  return new Response(JSON.stringify(manifesto), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" },
  });
});
