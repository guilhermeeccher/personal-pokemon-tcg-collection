"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { definirLocale } from "@/app/_acoes/definir-locale";
import { LOCALES, type Locale } from "@/i18n/config";

import estilos from "./casca.module.css";

const CODIGOS: Record<Locale, string> = { en: "EN", "pt-BR": "PT" };

/**
 * PT / EN. A mesma server action da v1 (`_acoes/definir-locale.ts`, que não é
 * pele: grava o cookie e revalida o layout); o desenho é da v2. Duas opções
 * só, então dois botões de alternar, não um `<select>`. O nome por extenso vai
 * no `aria-label`, nunca só no `title` — no celular não há hover.
 */
export function SeletorIdioma() {
  const t = useTranslations("seletorLocale");
  const atual = useLocale();
  const [trocando, iniciar] = useTransition();

  return (
    <div className={estilos.idiomas} role="group" aria-label={t("rotulo")} aria-busy={trocando}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          className={estilos.idioma}
          aria-label={t(locale)}
          aria-pressed={locale === atual}
          disabled={trocando}
          onClick={() => iniciar(() => definirLocale(locale))}
        >
          {CODIGOS[locale]}
        </button>
      ))}
    </div>
  );
}
