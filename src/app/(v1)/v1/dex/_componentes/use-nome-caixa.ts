"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { GrupoCaixa } from "@/lib/dominio/dex-caixas";
import { NOME_REGIAO_FORMA, type RegiaoForma } from "@/lib/dominio/dex-classificacao";

/**
 * Nome de uma caixa do HOME nas telas da Living Dex: "Nacional 2",
 * "Regionais · Hisui 1", "Cosméticas 3". O mesmo nas Caixas e em
 * Recebidos, para o usuário reconhecer a caixa de uma tela na outra.
 */
export function useNomeCaixa() {
  const t = useTranslations("dex");
  const grupo = useCallback(
    (g: GrupoCaixa, regiao: RegiaoForma | null) =>
      regiao ? `${t(`caixas.grupo.${g}`)} · ${NOME_REGIAO_FORMA[regiao]}` : t(`caixas.grupo.${g}`),
    [t],
  );
  const nome = useCallback(
    (caixa: { grupo: GrupoCaixa; regiao: RegiaoForma | null; indice: number }) =>
      t("caixas.nomeCaixa", { grupo: grupo(caixa.grupo, caixa.regiao), indice: String(caixa.indice) }),
    [t, grupo],
  );
  return { grupo, nome };
}
