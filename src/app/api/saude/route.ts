/**
 * `GET /api/saude`: o app está de pé e alcança o banco? Pública (sem
 * sessão), para o monitor de fora; só existe com `ACESSO_COM_SENHA=1` —
 * desligado, `rotaDoModulo` responde 404.
 *
 * `HEAD` não é exportado: o Next o deriva do `GET` sozinho (e
 * `ehRotaPublica` libera os dois).
 *
 * Responde só `{"ok":true}` ou 503 `{"ok":false}`, nada sobre o banco.
 */
import { sql } from "drizzle-orm";

import { rotaDoModulo } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { criarVerificadorSaude } from "@/lib/dominio/acesso/saude";

/* Uma instância só por processo, em `globalThis`, como o `limiteLogin`:
   o `next dev` recarrega o módulo a cada edição, e cada cópia nova
   abriria sua própria consulta e seu próprio cache. */
const CHAVE = Symbol.for("colecao-pokemon.acesso.saude");
const globais = globalThis as typeof globalThis & { [CHAVE]?: () => Promise<boolean> };
const verificarSaude = (globais[CHAVE] ??= criarVerificadorSaude({
  consultar: () => db.execute(sql`select 1`),
}));

/* Dinâmica à força: o envoltório responde 404 sem chamar o handler quando
   o módulo está desligado — o caso do build da imagem, feito sem o
   `.env`. Conferido no 16.3 com o `robots.txt`: sem isto, o build
   pré-renderiza aquele 404 e o congela. Esta rota hoje já sai dinâmica
   do build, mas a garantia não pode depender de detalhe do Next. */
export const dynamic = "force-dynamic";

export const GET = rotaDoModulo(async () => {
  const ok = await verificarSaude();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
});
