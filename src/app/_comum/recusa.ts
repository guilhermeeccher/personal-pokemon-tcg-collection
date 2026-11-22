/**
 * A borda onde a recusa do servidor vira frase.
 *
 * O servidor manda `{ recusa: { chave, valores } }` (ver
 * `lib/dominio/recusa.ts`); aqui a chave é resolvida no catálogo
 * `recusas` do idioma da interface. É o único lugar do cliente que faz
 * essa tradução — cada tela chama e recebe texto pronto.
 *
 * Três camadas de queda, nesta ordem:
 *
 * 1. a chave, se o catálogo do idioma ativo a conhece;
 * 2. o `erro` em texto, para as rotas que ainda respondem em português
 *    (guarda de corpo malformado, que a interface não alcança);
 * 3. a mensagem genérica da tela.
 *
 * O `t.has` da camada 1 não é zelo excessivo: chave nova no servidor
 * sem entrada no catálogo faria o `t` devolver o nome da chave, e o
 * usuário leria `copiaJaAlocada` no lugar da frase. Com a guarda ele lê
 * a mensagem genérica da tela, que é ruim mas não é código vazando.
 */

/**
 * O mínimo que o `t` do `next-intl` precisa oferecer. Interface própria
 * em vez do tipo do pacote para que este módulo não dependa da forma
 * interna do tradutor — o que se usa dele são estas duas coisas.
 */
export interface TradutorDeRecusa {
  (chave: string, valores?: Record<string, string>): string;
  has(chave: string): boolean;
}

interface CorpoComRecusa {
  recusa?: { chave?: unknown; valores?: unknown };
  recusas?: unknown;
  erro?: unknown;
}

function ehValores(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v).every((x) => typeof x === "string");
}

/** A frase de uma recusa, ou `null` quando o corpo não traz uma reconhecível. */
function traduzir(t: TradutorDeRecusa, bruta: unknown): string | null {
  if (typeof bruta !== "object" || bruta === null) return null;
  const { chave, valores } = bruta as { chave?: unknown; valores?: unknown };
  if (typeof chave !== "string" || !t.has(chave)) return null;
  return ehValores(valores) ? t(chave, valores) : t(chave);
}

/**
 * A frase para o corpo de uma resposta recusada. `padrao` é a mensagem
 * genérica da tela, usada quando o corpo não diz nada aproveitável.
 */
export function textoDaRecusa(t: TradutorDeRecusa, corpo: unknown, padrao: string): string {
  const c = (corpo ?? {}) as CorpoComRecusa;
  return traduzir(t, c.recusa) ?? (typeof c.erro === "string" ? c.erro : padrao);
}

/**
 * O mesmo, para a validação que devolve a lista inteira de erros de um
 * formulário (`{ recusas: [...] }`). Nunca volta vazia: sem nada
 * reconhecível, volta com a mensagem genérica sozinha.
 */
export function textosDasRecusas(t: TradutorDeRecusa, corpo: unknown, padrao: string): string[] {
  const c = (corpo ?? {}) as CorpoComRecusa;
  if (Array.isArray(c.recusas)) {
    const frases = c.recusas.map((r) => traduzir(t, r)).filter((f): f is string => f !== null);
    if (frases.length > 0) return frases;
  }
  return [textoDaRecusa(t, corpo, padrao)];
}
