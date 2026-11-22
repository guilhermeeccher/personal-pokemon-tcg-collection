/**
 * A violação de unicidade (23505) de um erro do banco, onde quer que ela
 * esteja na cadeia de `cause`.
 *
 * O Drizzle embrulha o erro do driver (`DrizzleQueryError`) e põe o original
 * em `cause`: olhar só o `code` do erro de fora deixa a violação passar como
 * erro genérico (500), e a recusa de negócio que ela devia virar (409) nunca
 * sai. A cadeia é percorrida até um limite, contra ciclo.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

const PROFUNDIDADE_MAXIMA = 5;

interface ComCodigo {
  code?: unknown;
  constraint_name?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/** O nome da restrição única violada, ou `null` se o erro não é uma violação de unicidade. */
export function restricaoUnicaViolada(err: unknown): string | null {
  let atual: unknown = err;
  for (let i = 0; i < PROFUNDIDADE_MAXIMA && typeof atual === "object" && atual !== null; i++) {
    const e = atual as ComCodigo;
    if (e.code === "23505") {
      const nome = e.constraint_name ?? e.constraint;
      return typeof nome === "string" ? nome : "";
    }
    atual = e.cause;
  }
  return null;
}
