"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { formasComFemea, rotuloDaForma } from "@/lib/dominio/dex-grade";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";

/**
 * Rótulo da forma nas telas da Living Dex, com macho e fêmea e o nome da
 * forma no idioma da interface (`rotuloDaForma`). Recebe o catálogo inteiro, porque saber se
 * uma vaga é o "macho" de um par depende da fêmea existir.
 */
export function useRotuloForma(formas: readonly FormaDexDTO[]) {
  const t = useTranslations("dex");
  const portugues = useLocale() === "pt-BR";
  const comFemea = useMemo(() => formasComFemea(formas), [formas]);
  const rotulos = useMemo(
    () => ({ macho: t("genero.macho"), femea: t("genero.femea"), portugues }),
    [t, portugues],
  );
  return useMemo(
    () => ({
      forma: (f: FormaDexDTO) => rotuloDaForma(f, comFemea, rotulos),
      nome: (f: FormaDexDTO) => {
        const forma = rotuloDaForma(f, comFemea, rotulos);
        return forma ? `${f.especie} (${forma})` : f.especie;
      },
    }),
    [comFemea, rotulos],
  );
}
