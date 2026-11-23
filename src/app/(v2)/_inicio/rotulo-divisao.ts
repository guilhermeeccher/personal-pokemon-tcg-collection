"use client";

import { useTranslations } from "next-intl";

import type { Divisao } from "@/lib/dominio/divisoes-colecao";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";

/**
 * O nome de uma divisão como a v1 o escreve (`useRotuloDivisao` da v1, que a
 * v2 não importa): a região na Pokédex, o nome do set, e a parte quando o set
 * se divide em principal e secretas. Os textos da parte são os do namespace
 * `divisoes`, os mesmos das duas versões.
 */
export function useRotuloDivisao(): (d: Divisao) => string {
  const t = useTranslations("divisoes");
  return (d) => {
    if (d.tipo === "regiao") return NOME_REGIAO[d.regiao];
    if (d.parte === "inteiro") return d.setNome;
    return `${d.setNome} · ${t(d.parte)}`;
  };
}

/**
 * O percentual de um anel: arredondado para baixo, e 100 só quando nada
 * falta — "100%" ao lado de "falta 1" seria mentira (a mesma regra de
 * `progressoDaColecao`).
 */
export function percentualDoAnel(feitas: number, total: number): number {
  if (total <= 0) return 0;
  if (feitas >= total) return 100;
  return Math.floor((Math.max(feitas, 0) / total) * 100);
}
