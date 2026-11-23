import { RedirectType, redirect } from "next/navigation";

import { destinoV1, type BuscaDaPonte } from "@/lib/dominio/destino-v1";

/**
 * O corpo de toda página-ponte da v2 (2026-11-22): a tela ainda não existe
 * aqui, então vai para a mesma tela em `/v1`, com a query.
 *
 * Regras de uma ponte, todas de propósito:
 * - **`await exigirSessao()` antes**, como em qualquer página: a ponte passa
 *   pelo proxy, pela guarda e pelo `cobertura-estatica.test.ts` sem exceção.
 *   Por isso é página, e não um `redirects()` no `next.config.ts` — esse roda
 *   antes do proxy (sairia sem os cabeçalhos de segurança, e daria 307 com a
 *   configuração incompleta, quando tudo tem que dar 503), é montado no build
 *   sem o `.env` e venceria a tela real da v2 quando ela chegasse.
 * - **307, nunca 308.** O `redirect()` numa página responde 307; o 308 do
 *   `permanentRedirect` o navegador guarda para sempre, e continuaria indo
 *   para `/v1` depois que a tela da v2 existisse.
 * - **Nenhum catch-all na v2.** Na raiz, ele pegaria toda URL sem rota,
 *   inclusive os caminhos do módulo de acesso desligado, e trocaria o 404 deles
 *   por um 307. Abaixo de `/dex` ele existiu até o pacote 5-0 (2026-11-23) e
 *   saiu: a Dex tem uma ponte por tela, e um caminho de Dex que a v1 não tem
 *   cai no 404 padrão do Next, como qualquer URL inexistente.
 *
 * Quando a tela da v2 fica pronta, a página real substitui a ponte no mesmo
 * caminho; `grep -rl irParaV1 'src/app/(v2)'` lista o que falta.
 * `telas-v1.test.ts` garante que toda tela da v1 tem par aqui e que toda
 * ponte aponta para uma tela que existe.
 */
export function irParaV1(segmentos: readonly string[], busca: BuscaDaPonte): never {
  redirect(destinoV1(segmentos, busca), RedirectType.replace);
}
