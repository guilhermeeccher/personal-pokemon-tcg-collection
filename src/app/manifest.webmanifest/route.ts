/**
 * Manifesto do PWA. Só existe com `ACESSO_COM_SENHA=1` (o PWA liga junto
 * com o acesso por senha); desligado, `rotaDoModulo` responde 404.
 *
 * Esqueleto: um manifesto mínimo e válido. O conteúdo de verdade (ícones,
 * cores, nome curto) vem com a parte do PWA.
 *
 * Route handler, e não `app/manifest.ts`, pelo mesmo motivo do
 * `robots.txt/route.ts`: o `manifest.ts` é gerado no build e fica em cache,
 * sem ler a flag por requisição. O `connection()` e o `dynamic` abaixo
 * mantêm a rota dinâmica.
 */
import { connection } from "next/server";

import { rotaDoModulo } from "@/lib/acesso";

/* `force-dynamic` além do `connection()`: o `connection()` fica dentro do
   handler, e o envoltório responde 404 antes de chamá-lo quando o módulo
   está desligado — que é o caso no build da imagem, feito sem o `.env`.
   Conferido no 16.3: sem esta linha, o build pré-renderiza a rota com
   aquele 404 e a congela (`○` na saída do build), e ligar o módulo depois
   não a faria aparecer. */
export const dynamic = "force-dynamic";

export const GET = rotaDoModulo(async () => {
  await connection();
  const manifesto = {
    name: "Pokémon Collection",
    start_url: "/",
    display: "standalone",
  };
  return new Response(JSON.stringify(manifesto), {
    headers: { "Content-Type": "application/manifest+json" },
  });
});
