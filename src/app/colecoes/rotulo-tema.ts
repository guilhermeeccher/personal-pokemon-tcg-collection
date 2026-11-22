"use client";

/**
 * Como a tela escreve um tema no idioma da interface. O servidor guarda e
 * devolve o valor como o catálogo o tem (o tipo em inglês, a forma como enum,
 * a espécie como número nacional); traduzir é da tela, e o que ela não sabe
 * traduzir ela mostra como está — nunca adivinha (decisão de 2026-11-22).
 *
 * - **tipo**: `tiposPokemon.<nome em inglês>`; um tipo sem entrada fica como gravado.
 * - **forma**: `temaColecao.formas.<forma>`; idem.
 * - **raridade**: `raridadesCarta.<raridade em inglês>` (o valor do tema é a
 *   raridade canônica, a da ficha en da carta); sem entrada, como gravada.
 * - **ilustrador**: exatamente como gravado, sem juntar grafias.
 * - **espécie**: o nome vem de `rotulo` (na sugestão) ou de `temaRotulo` (na
 *   coleção e na lista de cartas); só sem nome nenhum cai em "Pokémon nº N".
 *
 * O nome padrão de uma coleção temática sai do mesmo rótulo ("Tema — Psíquico",
 * "Tema — Ilustrações de 5ban Graphics"); quem cria pode editá-lo.
 */

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { TipoTema } from "@/lib/dominio/tema-colecao";

export function useRotuloTema() {
  const t = useTranslations("temaColecao");
  const tp = useTranslations("tiposPokemon");
  const tra = useTranslations("raridadesCarta");

  const rotuloDoTema = useCallback(
    (tipo: TipoTema, valor: string, rotulo?: string): string => {
      switch (tipo) {
        case "especie":
          return rotulo ?? t("especieSemNome", { numero: valor });
        case "tipo":
          return tp.has(valor) ? tp(valor) : valor;
        case "raridade":
          // O valor é a raridade canônica (a da ficha en); sem tradução, como está.
          return tra.has(valor) ? tra(valor) : valor;
        case "forma":
          return t.has(`formas.${valor}`) ? t(`formas.${valor}`) : valor;
        case "ilustrador":
          return valor;
      }
    },
    [t, tp, tra],
  );

  const nomePadraoDoTema = useCallback(
    (tipo: TipoTema, valor: string, rotulo?: string): string => {
      const texto = rotuloDoTema(tipo, valor, rotulo);
      return tipo === "ilustrador" ? t("nomePadraoIlustrador", { rotulo: texto }) : t("nomePadrao", { rotulo: texto });
    },
    [rotuloDoTema, t],
  );

  return { rotuloDoTema, nomePadraoDoTema };
}
