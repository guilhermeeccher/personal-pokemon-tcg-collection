/**
 * `robots.txt` do acesso por senha: bloqueia tudo. Só existe com
 * `ACESSO_COM_SENHA=1`; desligado, `rotaDoModulo` responde 404 — como hoje,
 * em que o app não tem `robots.txt`.
 *
 * Route handler, e não `app/robots.ts`: o `robots.ts` é gerado no build e
 * fica em cache, e a imagem Docker é construída sem o `.env`. Ele leria a
 * flag uma vez, desligada, e ligar o módulo depois não o faria aparecer.
 * Aqui a flag é lida a cada requisição, e a rota é dinâmica (o
 * `connection()` e o `dynamic` abaixo), para o build nunca a congelar.
 *
 * Quem garante que nada vaza é a senha; isto só pede aos robôs que não
 * indexem.
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
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
