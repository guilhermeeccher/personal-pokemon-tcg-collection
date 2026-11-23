"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

/** O fuso das datas da interface (o mesmo da decisão 5 do README da v2). */
const FUSO = "America/Sao_Paulo";

/**
 * Os formatos do detalhe no idioma da interface: reais, euros, datas.
 * Um instante (`criadoEm`, `em`) sai no fuso de São Paulo; uma data sem hora
 * (`aquisicaoData`, `cotacaoData`, `AAAA-MM-DD`) sai como está — lê-la como
 * instante em UTC e formatar no fuso de São Paulo a jogaria para o dia
 * anterior.
 */
export function useFormatos() {
  const locale = useLocale();
  return useMemo(() => {
    const brl = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" });
    const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    const cotacao = new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const instante = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: FUSO });
    const dia = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" });
    return {
      brl: (n: number) => brl.format(n),
      eur: (n: number) => eur.format(n),
      cotacao: (n: number) => cotacao.format(n),
      instante: (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : instante.format(d);
      },
      dia: (aaaaMmDd: string) => {
        const d = new Date(`${aaaaMmDd.slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? aaaaMmDd : dia.format(d);
      },
    };
  }, [locale]);
}

export type Formatos = ReturnType<typeof useFormatos>;
