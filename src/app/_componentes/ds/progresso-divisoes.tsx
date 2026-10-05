"use client";

/**
 * Progresso por divisão (`lib/dominio/divisoes-colecao.ts`): uma linha por
 * região ou parte de set, com barra, contagem e percentual. Usado na tela
 * da coleção e no cartão de cada coleção na visão geral.
 *
 * Cada divisão leva uma cor da paleta, na ordem, para que "principal" e
 * "secretas" não sejam duas barras vermelhas iguais; divisão fechada fica
 * verde, que é a cor de vaga preenchida no sistema.
 */

import { useLocale, useTranslations } from "next-intl";

import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { formatarPercentual } from "@/app/_componentes/ds/linha-distribuicao";
import type { Divisao } from "@/lib/dominio/divisoes-colecao";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";

const CORES_DIVISAO = [
  "var(--berry-4)",
  "var(--sky-4)",
  "var(--grape-2)",
  "var(--caramel-3)",
  "var(--rose-2)",
  "var(--sun-3)",
] as const;

export const COR_DIVISAO_COMPLETA = "var(--leaf-4)";

export function corDaDivisao(indice: number, divisao: Divisao): string {
  if (divisao.total > 0 && divisao.preenchidas === divisao.total) return COR_DIVISAO_COMPLETA;
  return CORES_DIVISAO[indice % CORES_DIVISAO.length];
}

export function percentualDe(preenchidas: number, total: number): number {
  return total > 0 ? (preenchidas / total) * 100 : 0;
}

/** Rótulo de uma divisão: a região, ou o set com a parte quando ele se parte. */
export function useRotuloDivisao(): (d: Divisao) => string {
  const t = useTranslations("divisoes");
  return (d) => {
    if (d.tipo === "regiao") return NOME_REGIAO[d.regiao];
    if (d.parte === "inteiro") return d.setNome;
    return `${d.setNome} · ${t(d.parte)}`;
  };
}

export function ProgressoDivisoes({
  divisoes,
  limite,
  compacto = false,
  colunas = false,
}: {
  divisoes: readonly Divisao[];
  /** Mostra só as primeiras; o resto vira "+N". */
  limite?: number;
  compacto?: boolean;
  /** Duas colunas a partir da largura média — para o painel da tela da coleção. */
  colunas?: boolean;
}) {
  const t = useTranslations("divisoes");
  const locale = useLocale();
  const rotulo = useRotuloDivisao();
  const visiveis = limite ? divisoes.slice(0, limite) : divisoes;
  const restantes = divisoes.length - visiveis.length;

  return (
    <ul
      className={`grid ${compacto ? "gap-1.5" : "gap-2.5"} ${colunas ? "md:grid-cols-2 md:gap-x-8" : ""}`}
    >
      {visiveis.map((d, i) => (
        <li key={d.id} className="flex flex-col gap-1">
          <div
            className={`flex items-baseline justify-between gap-3 ${compacto ? "text-xs" : "text-sm"}`}
          >
            <span className="min-w-0 truncate text-foreground">{rotulo(d)}</span>
            <span className="shrink-0 font-mono tabular-nums whitespace-nowrap text-muted">
              {d.preenchidas}/{d.total} ·{" "}
              <span className="text-strong">
                {formatarPercentual(percentualDe(d.preenchidas, d.total), locale)}
              </span>
            </span>
          </div>
          <BarraProgresso
            valor={d.preenchidas}
            maximo={d.total}
            cor={corDaDivisao(i, d)}
            altura={compacto ? 5 : 7}
          />
        </li>
      ))}
      {restantes > 0 && (
        <li className="text-xs text-muted">{t("maisDivisoes", { total: restantes })}</li>
      )}
    </ul>
  );
}
