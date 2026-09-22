"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icone } from "./icone";
import { encontrarAtivo, grupoDoItem } from "./nav-estrutura";

/**
 * TopBar — a faixa fixa de 56px do design system, que junto com a lombada
 * forma o "chrome fica, conteúdo rola".
 *
 * Carrega só a trilha (grupo / página), derivada da rota a partir do mesmo
 * mapa que a navegação usa. Deliberadamente **sem busca global**: busca que
 * atravessa o site é funcionalidade que não existe hoje, e a migração é de
 * design. As ações continuam onde sempre estiveram, no `CabecalhoPagina` de
 * cada tela.
 *
 * Só aparece do `md` para cima — no mobile quem ocupa o topo é o header da
 * própria `Nav`, com o botão da gaveta.
 */
export function TopBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const ativo = encontrarAtivo(pathname);
  const grupo = ativo ? grupoDoItem(ativo) : null;

  /* Grupo e item podem ter o mesmo rótulo ("Coleções" / "Coleções"), e aí a
     trilha mostra só um. A comparação é sobre o texto JÁ traduzido: em outro
     idioma a coincidência pode não se repetir. */
  const tituloGrupo = grupo ? t(grupo.chaveTitulo) : null;
  const rotuloAtivo = ativo ? t(ativo.chaveLabel) : null;

  return (
    <header className="hidden h-14 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-6 md:flex">
      {ativo ? (
        <nav aria-label={t("trilha")} className="flex items-center gap-2 text-[13px]">
          {tituloGrupo && tituloGrupo !== rotuloAtivo && (
            <>
              <span className="text-muted">{tituloGrupo}</span>
              <span className="text-subtle" aria-hidden>
                <Icone nome="chevron-right" tamanho={13} />
              </span>
            </>
          )}
          <span className="font-semibold text-strong">{rotuloAtivo}</span>
        </nav>
      ) : (
        <span className="text-[13px] text-muted">{t("inicio")}</span>
      )}
    </header>
  );
}
