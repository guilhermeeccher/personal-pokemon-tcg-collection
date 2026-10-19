"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { destinoAposSair } from "@/lib/dominio/acesso/sair";

import { Icone } from "./icone";
import { ENERGIAS, encontrarAtivo, modulosDaNav, type ItemNav, type ModuloNav } from "./nav-estrutura";
import { SeletorLocale } from "./seletor-locale";

/**
 * Nav — a "lombada do álbum": a única superfície escura do sistema, em
 * ameixa, 248px fixos à esquerda no desktop.
 *
 * No rodapé, a fileira de pontos de 9px com as onze cores de tipo. É
 * decoração pura — nenhum dado, nenhuma interação — e é o detalhe mais
 * literal de nostalgia da interface inteira, segundo o próprio design
 * system. As cores vêm dos tokens `--energy-*`.
 *
 * Abaixo de `md` a lombada some e vira header + gaveta, como já era. O
 * design system é desktop-only, mas o site não: o mobile continua
 * funcionando, só que agora também em ameixa.
 */

/**
 * Os módulos (TCG, Virtual Game), cada um com cabeçalho próprio — ícone e
 * nome — e uma linha antes do segundo: dois blocos, não uma lista só.
 */
function ListaModulos({
  modulos,
  ativo,
  onNavegar,
}: {
  modulos: readonly ModuloNav[];
  ativo: ItemNav | null;
  onNavegar?: () => void;
}) {
  const t = useTranslations("nav");
  return (
    <div className="flex flex-col gap-6">
      {modulos.map((modulo, i) => (
        <section
          key={modulo.chaveTitulo}
          aria-label={t(modulo.chaveTitulo)}
          className={`flex flex-col gap-4 ${i > 0 ? "border-t border-shell-line pt-5" : ""}`}
        >
          <div className="flex items-center gap-2 px-3 text-invert">
            <span className="flex h-6 w-6 items-center justify-center rounded-[var(--raio-sm)] bg-accent text-accent-fg">
              <Icone nome={modulo.icone} tamanho={14} />
            </span>
            <span className="font-display text-[14px] font-bold tracking-wide">{t(modulo.chaveTitulo)}</span>
          </div>
          {modulo.grupos.map((grupo) => (
            <div key={grupo.chaveTitulo ?? `${modulo.chaveTitulo}-topo`} className="flex flex-col gap-0.5">
              {grupo.chaveTitulo && <span className="eyebrow px-3 pb-1 text-invert-muted">{t(grupo.chaveTitulo)}</span>}
              {grupo.itens.map((item) => {
                const isAtivo = item.href === ativo?.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavegar}
                    aria-current={isAtivo ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-pill px-3 py-1.5 text-[13px] [transition:var(--transition-control)] max-md:min-h-11 ${
                      isAtivo
                        ? "bg-accent font-bold text-accent-fg"
                        : "text-invert-muted hover:bg-shell-hover hover:text-invert"
                    }`}
                  >
                    <Icone nome={item.icone} tamanho={15} />
                    {t(item.chaveLabel)}
                  </Link>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Monograma + wordmark, o topo da lombada. */
function Marca({ onNavegar }: { onNavegar?: () => void }) {
  const t = useTranslations("nav");
  return (
    <Link
      href="/"
      onClick={onNavegar}
      className="flex items-center gap-2.5 text-invert [transition:var(--transition-control)] hover:opacity-80 max-md:min-h-11"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--raio-sm)] bg-accent text-[11px] font-bold text-accent-fg">
        CP
      </span>
      <span className="font-display text-[15px] font-bold">{t("marca")}</span>
    </Link>
  );
}

/** A fileira de pontos de energia — só cor, nenhum dado. */
function PontosDeEnergia() {
  return (
    <div className="flex gap-1.5 px-3" aria-hidden>
      {ENERGIAS.map((energia) => (
        <span
          key={energia}
          className="h-[9px] w-[9px] rounded-pill"
          style={{ background: `var(--energy-${energia})` }}
        />
      ))}
    </div>
  );
}

/**
 * "Sair" — só com o módulo de acesso por senha ligado. Pede o `DELETE` e
 * **espera o servidor confirmar** antes de navegar: `200` (cookie apagado) e
 * `401` (a sessão já não valia) vão ao login por navegação completa; qualquer
 * outro status, ou falha de rede, fica na tela com um aviso e o botão livre
 * para nova tentativa (`destinoAposSair`). Navegar assim mesmo mostraria um
 * login que o proxy devolveria para dentro, com a sessão ainda viva. É
 * `<button>` e não link porque muda estado. Mesmo tratamento das pílulas da
 * lombada, com 44px de altura no celular.
 */
function Sair() {
  const t = useTranslations("nav");
  const [saindo, setSaindo] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    setFalhou(false);
    let status: number | null = null;
    try {
      status = (await fetch("/api/sessao", { method: "DELETE" })).status;
    } catch {
      /* Sem resposta: tratado como falha, abaixo. */
    }
    if (destinoAposSair(status) === "login") {
      window.location.replace("/login");
      return;
    }
    setFalhou(true);
    setSaindo(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="flex items-center rounded-pill px-3 py-1.5 text-left text-[13px] text-invert-muted [transition:var(--transition-control)] hover:bg-shell-hover hover:text-invert max-md:min-h-11"
      >
        {t("sair")}
      </button>
      {falhou && (
        <p role="alert" className="px-3 text-xs text-invert-muted">
          {t("sairErro")}
        </p>
      )}
    </div>
  );
}

export function Nav({ livingDex, acessoComSenha = false }: { livingDex: boolean; acessoComSenha?: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const ativo = encontrarAtivo(pathname);
  const modulos = modulosDaNav(livingDex);
  const [aberto, setAberto] = useState(false);

  /* No login não há sessão: sem módulos (cada link cairia de volta aqui),
     sem "Sair" e sem o seletor de idioma, cuja server action é protegida e
     falharia. Sobra a marca; o idioma vem do cookie ou do navegador. */
  if (acessoComSenha && pathname === "/login") {
    return (
      <>
        <header className="flex items-center border-b border-shell-line bg-shell px-4 py-3 md:hidden">
          <Marca />
        </header>
        <aside className="hidden w-62 shrink-0 flex-col justify-between gap-6 border-r border-shell-line bg-shell px-3 py-5 md:flex">
          <div className="px-3">
            <Marca />
          </div>
          <PontosDeEnergia />
        </aside>
      </>
    );
  }

  return (
    <>
      {/* Mobile: barra superior com marca + botão de abrir/fechar. O botão, a
          marca e os itens do menu têm 44px de altura (`max-md:min-h-11`); o
          botão também 44 de largura. */}
      <header className="flex items-center justify-between border-b border-shell-line bg-shell px-4 py-3 md:hidden">
        <Marca onNavegar={() => setAberto(false)} />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? t("fecharMenu") : t("abrirMenu")}
          className="rounded-pill p-2 text-invert-muted [transition:var(--transition-control)] hover:bg-shell-hover hover:text-invert max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
        >
          <Icone nome={aberto ? "x" : "menu"} tamanho={20} />
        </button>
      </header>
      {aberto && (
        <nav className="flex flex-col gap-5 border-b border-shell-line bg-shell px-2 py-3 md:hidden">
          <ListaModulos modulos={modulos} ativo={ativo} onNavegar={() => setAberto(false)} />
          <SeletorLocale />
          {acessoComSenha && <Sair />}
        </nav>
      )}

      {/* Desktop: a lombada, 248px fixos, com rolagem própria se a lista
          crescer — o rodapé de pontos fica colado embaixo. */}
      <aside className="hidden w-62 shrink-0 flex-col gap-6 border-r border-shell-line bg-shell px-3 py-5 md:flex">
        <div className="px-3">
          <Marca />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto">
          <ListaModulos modulos={modulos} ativo={ativo} />
        </nav>
        <SeletorLocale />
        {acessoComSenha && <Sair />}
        <PontosDeEnergia />
      </aside>
    </>
  );
}
