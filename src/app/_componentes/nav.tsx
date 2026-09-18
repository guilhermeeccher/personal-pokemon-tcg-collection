"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icone } from "./icone";
import { ENERGIAS, GRUPOS, encontrarAtivo, type ItemNav } from "./nav-estrutura";

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

function ListaGrupos({ ativo, onNavegar }: { ativo: ItemNav | null; onNavegar?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-0.5">
          <span className="eyebrow px-3 pb-1 text-invert-muted">{grupo.titulo}</span>
          {grupo.itens.map((item) => {
            const isAtivo = item.href === ativo?.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavegar}
                aria-current={isAtivo ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-pill px-3 py-1.5 text-[13px] [transition:var(--transition-control)] ${
                  isAtivo
                    ? "bg-accent font-bold text-accent-fg"
                    : "text-invert-muted hover:bg-shell-hover hover:text-invert"
                }`}
              >
                <Icone nome={item.icone} tamanho={15} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Monograma + wordmark, o topo da lombada. */
function Marca({ onNavegar }: { onNavegar?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavegar}
      className="flex items-center gap-2.5 text-invert [transition:var(--transition-control)] hover:opacity-80"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--raio-sm)] bg-accent text-[11px] font-bold text-accent-fg">
        CP
      </span>
      <span className="font-display text-[15px] font-bold">Coleção Pokémon</span>
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

export function Nav() {
  const pathname = usePathname();
  const ativo = encontrarAtivo(pathname);
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {/* Mobile: barra superior com marca + botão de abrir/fechar. */}
      <header className="flex items-center justify-between border-b border-shell-line bg-shell px-4 py-3 md:hidden">
        <Marca onNavegar={() => setAberto(false)} />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          className="rounded-pill p-2 text-invert-muted [transition:var(--transition-control)] hover:bg-shell-hover hover:text-invert"
        >
          <Icone nome={aberto ? "x" : "menu"} tamanho={20} />
        </button>
      </header>
      {aberto && (
        <nav className="border-b border-shell-line bg-shell px-2 py-3 md:hidden">
          <ListaGrupos ativo={ativo} onNavegar={() => setAberto(false)} />
        </nav>
      )}

      {/* Desktop: a lombada, 248px fixos, com rolagem própria se a lista
          crescer — o rodapé de pontos fica colado embaixo. */}
      <aside className="hidden w-62 shrink-0 flex-col gap-6 border-r border-shell-line bg-shell px-3 py-5 md:flex">
        <div className="px-3">
          <Marca />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto">
          <ListaGrupos ativo={ativo} />
        </nav>
        <PontosDeEnergia />
      </aside>
    </>
  );
}
