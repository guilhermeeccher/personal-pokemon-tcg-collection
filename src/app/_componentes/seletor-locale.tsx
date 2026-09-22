"use client";

/**
 * Seletor de idioma da interface — o par de pílulas no rodapé da lombada.
 *
 * Duas opções só, então nada de `<select>`: o controle tem o mesmo
 * tratamento de item ativo/inativo da navegação logo acima (acento sólido
 * quando ativo, `invert-muted` com hover de shell quando não), porque é a
 * mesma superfície escura e inventar um terceiro visual ali chamaria mais
 * atenção do que a função merece.
 *
 * O rótulo é o código curto (EN/PT), com o nome por extenso no `title` e no
 * `aria-label` — em 28px de altura o nome inteiro não cabe, e o código é o
 * que quem troca de idioma já reconhece.
 *
 * Trocar dispara a server action e, enquanto ela roda, o grupo inteiro fica
 * `aria-busy`: a re-renderização vem do servidor e leva um quadro ou dois.
 */

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { definirLocale } from "@/app/_acoes/definir-locale";
import { LOCALES, type Locale } from "@/i18n/config";

const CODIGOS: Record<Locale, string> = {
  en: "EN",
  "pt-BR": "PT",
};

export function SeletorLocale() {
  const t = useTranslations("seletorLocale");
  const atual = useLocale();
  const [trocando, iniciarTroca] = useTransition();

  return (
    <div
      className="flex items-center gap-1 px-3"
      role="group"
      aria-label={t("rotulo")}
      aria-busy={trocando}
    >
      {LOCALES.map((locale) => {
        const ativo = locale === atual;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            title={t(locale)}
            aria-label={t(locale)}
            aria-pressed={ativo}
            disabled={trocando}
            onClick={() => iniciarTroca(() => definirLocale(locale))}
            className={`rounded-pill px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] [transition:var(--transition-control)] ${
              ativo
                ? "bg-accent text-accent-fg"
                : "text-invert-muted hover:bg-shell-hover hover:text-invert"
            }`}
          >
            {CODIGOS[locale]}
          </button>
        );
      })}
    </div>
  );
}
