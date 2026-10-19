/**
 * Conferência de origem contra requisição forjada vinda de outro site.
 *
 * Complementa o `SameSite=Lax` do cookie: em todo método que pode alterar
 * dados (tudo menos `GET`, `HEAD` e `OPTIONS`) — inclusive entrar e sair —
 * a origem completa, esquema + host + porta, tem que estar na lista
 * `ORIGENS_PERMITIDAS`. Comparação exata de texto, sem "termina com" nem
 * curinga: é a forma de um subdomínio parecido não passar.
 *
 * O método é comparado exato. O `Request` já normaliza os métodos padrão
 * para maiúsculas; qualquer outra grafia cai no lado que confere a origem.
 */

const SEM_EFEITO = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CabecalhosOrigem {
  metodo: string;
  origin: string | null | undefined;
  referer: string | null | undefined;
}

export function origemPermitida(
  { metodo, origin, referer }: CabecalhosOrigem,
  permitidas: ReadonlySet<string>,
): boolean {
  if (SEM_EFEITO.has(metodo)) return true;

  /* `Origin` presente manda sozinho. O literal `null` (contexto opaco:
     iframe com sandbox, redirecionamento entre sites) ou um valor fora da
     lista é recusa, sem consultar o `Referer` — senão bastaria mandar um
     `Origin` ruim e um `Referer` bom. */
  if (origin !== null && origin !== undefined) return permitidas.has(origin);

  /* Sem `Origin` (navegador antigo, alguns casos de mesmo site): vale a
     origem do `Referer`. Sem nenhum dos dois, recusa — nenhum navegador
     atual manda um POST de formulário sem os dois, e o `Referrer-Policy`
     do app é `same-origin`, que mantém o `Referer` no próprio site. */
  if (referer === null || referer === undefined) return false;
  let origemReferer: string;
  try {
    origemReferer = new URL(referer).origin;
  } catch {
    return false;
  }
  // `new URL("data:...").origin` é o texto "null", que nunca está na lista.
  return permitidas.has(origemReferer);
}
