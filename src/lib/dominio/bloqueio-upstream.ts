/**
 * Classificação de falha de rede contra a TCGdex.
 *
 * Existe por causa de um incidente real (2026-08-25): o sync rodava com 40
 * requisições de carta em paralelo, sem intervalo, uma requisição por carta —
 * ~35.000 requisições em pt+en. A partir da manhã seguinte, `api.tcgdex.net`
 * passou a responder **connection refused** para o nosso IP, enquanto
 * respondia 200 normalmente para o resto da internet (confirmado em
 * 2026-08-26 por proxy externo). Ou seja: não foi queda deles, foi bloqueio
 * do nosso IP no firewall.
 *
 * A lição que este módulo codifica: diante de bloqueio, **insistir piora**.
 * O retry cego de 3 tentativas por requisição multiplicava por três as
 * batidas na porta fechada. Erro de bloqueio precisa abortar o sync inteiro,
 * não virar mais uma carta pulada no relatório.
 */

export type ClasseErroUpstream =
  /** Nosso acesso foi barrado. Parar tudo: insistir renova o bloqueio. */
  | "bloqueio"
  /** Oscilação legítima (5xx, timeout). Vale repetir com backoff. */
  | "transitorio"
  /** Resposta definitiva do servidor (404). Pular o item, seguir o sync. */
  | "permanente";

/** Códigos de erro de socket que, contra um host que sabemos estar no ar,
 *  significam "estamos barrados", não "o servidor caiu". */
const CODIGOS_BLOQUEIO = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** Erro lançado quando o upstream barrou nosso acesso. Aborta o sync. */
export class ErroBloqueioUpstream extends Error {
  constructor(readonly motivo: string) {
    super(
      `Acesso à TCGdex bloqueado (${motivo}). Sync abortado de propósito: ` +
        `continuar tentando renova o bloqueio do IP. Ver o incidente de ` +
        `2026-08-25 em lib/dominio/bloqueio-upstream.ts.`,
    );
    this.name = "ErroBloqueioUpstream";
  }
}

/** Classifica um status HTTP de resposta. */
export function classificarStatus(status: number): ClasseErroUpstream {
  // 429 é o pedido explícito de "pare"; 403 é a forma que um firewall de
  // borda costuma usar para barrar cliente indesejado.
  if (status === 429 || status === 403) return "bloqueio";
  if (status >= 500) return "transitorio";
  return "permanente";
}

/**
 * Classifica um erro capturado de `fetch`. O código do socket vem em
 * `err.cause.code` no undici (runtime do Node 22), por isso a busca
 * desce um nível.
 */
export function classificarErro(err: unknown): ClasseErroUpstream {
  const codigo = extrairCodigo(err);
  if (codigo && CODIGOS_BLOQUEIO.has(codigo)) return "bloqueio";
  return "transitorio";
}

function extrairCodigo(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const comCodigo = err as { code?: unknown; cause?: unknown };
  if (typeof comCodigo.code === "string") return comCodigo.code;
  if (comCodigo.cause !== undefined) return extrairCodigo(comCodigo.cause);
  return null;
}
