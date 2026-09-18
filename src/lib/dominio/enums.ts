/**
 * Enums de domínio compartilhados pelos módulos de validação em
 * `lib/dominio/`. Espelham os enums Postgres definidos em
 * `src/lib/db/schema.ts` — se o schema mudar, atualize aqui também. Vive
 * separado do schema Drizzle de propósito: mantém `lib/dominio/` puro e
 * verificável sem tocar no ORM (AGENTS.md: regras de negócio em módulos
 * puros, fora de componentes React e route handlers).
 */

export const IDIOMAS = ["pt", "en", "jp"] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const VARIANTES_COPIA = [
  "normal",
  "reverse",
  "holo",
  "primeira_edicao",
  "promo",
] as const;
export type VarianteCopia = (typeof VARIANTES_COPIA)[number];

export const CONDICOES = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type Condicao = (typeof CONDICOES)[number];

export function ehIdioma(v: unknown): v is Idioma {
  return typeof v === "string" && (IDIOMAS as readonly string[]).includes(v);
}
export function ehVarianteCopia(v: unknown): v is VarianteCopia {
  return (
    typeof v === "string" &&
    (VARIANTES_COPIA as readonly string[]).includes(v)
  );
}
export function ehCondicao(v: unknown): v is Condicao {
  return typeof v === "string" && (CONDICOES as readonly string[]).includes(v);
}
