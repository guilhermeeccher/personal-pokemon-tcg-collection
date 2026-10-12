/**
 * Living Dex — quais seções entram no progresso (spec §3.4, regra 4).
 *
 * `base` conta sempre; `regional`, `genero` e `especial` o usuário liga e
 * desliga. `cosmetica` também conta sempre, mas na vista dela: as formas
 * cosméticas têm progresso próprio, separado do principal (decisão de
 * 2026-10-11). Seção que nunca foi tocada não tem linha em `dex_secao` e usa
 * o padrão abaixo; uma linha antiga de `cosmetica` é ignorada.
 *
 * **Padrão: todas ligadas.** A living dex combinada em 2026-10-11 é a
 * detalhada, com todas as formas que o HOME guarda; desligar é a exceção.
 * Seção desligada continua visível na grade, marcada como fora da conta.
 *
 * Módulo puro, sem I/O.
 */
import { SECOES_LIGAVEIS, type CategoriaFormaDex, type SecaoLigavel } from "./dex-classificacao";

export const SECAO_CONTA_POR_PADRAO = true;

export type SecoesContadas = Readonly<Record<SecaoLigavel, boolean>>;

export function ehSecaoLigavel(valor: unknown): valor is SecaoLigavel {
  return typeof valor === "string" && (SECOES_LIGAVEIS as readonly string[]).includes(valor);
}

/** Resolve o estado das quatro seções a partir das linhas gravadas. */
export function resolverSecoes(
  linhas: readonly { categoria: CategoriaFormaDex; conta: boolean }[],
): SecoesContadas {
  const resultado = Object.fromEntries(
    SECOES_LIGAVEIS.map((s) => [s, SECAO_CONTA_POR_PADRAO]),
  ) as Record<SecaoLigavel, boolean>;
  for (const linha of linhas) {
    if (ehSecaoLigavel(linha.categoria)) resultado[linha.categoria] = linha.conta;
  }
  return resultado;
}

export function categoriaConta(categoria: CategoriaFormaDex, secoes: SecoesContadas): boolean {
  if (categoria === "base" || categoria === "cosmetica") return true;
  return secoes[categoria];
}
