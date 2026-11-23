"use client";

/**
 * O cartão do Pokémon da v2: o render grande do HOME, o nome e as linhas que
 * a tela quiser (estado, caixa e posição). Peça compartilhada da Dex (dono:
 * pacote 5a; usam 5a, 5b e 5d — `docs/design-v2/rules.md`, "Dex shared
 * code"). Portado de `(v1)/v1/dex/_componentes/cartao-pokemon.tsx`, que na v1
 * só abria com o mouse; aqui são três peças, uma por caminho:
 *
 * - **`CartaoPokemon`** — só o conteúdo, sem posição nem camada.
 * - **`FolhaPokemon`** — o caminho de toque e de teclado: a janela da v2
 *   (diálogo no desktop, folha de baixo no celular), com o cartão e as ações
 *   da tela no rodapé ("Registrar", por exemplo). É o que um toque numa vaga
 *   abre; com ela, nada do cartão depende de hover (AGENTS.md, "Nothing only
 *   on hover or in `title`").
 * - **`useCartaoFlutuante`** — a pré-visão ao parar o mouse, como na v1. É
 *   realce: só com ponteiro de mouse, nunca com toque nem caneta, não pega
 *   foco nem clique, e some ao rolar. Tudo o que ela mostra a tela também
 *   mostra por escrito ou pela folha.
 *
 * O render (~80 KB) só é baixado de quem a pessoa abriu ou parou em cima, um
 * por vez, nunca de uma grade inteira; a grade usa o sprite pequeno.
 */

import { useTranslations } from "next-intl";
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { urlRenderHomeDex } from "@/lib/imagens";

import { Modal } from "../../_componentes/primitivos/modal";
import type { ResolvedorFoco } from "../../_componentes/primitivos/use-camada";

import estilos from "./dex.module.css";

export interface DadosCartaoPokemon {
  /** O sprite da forma (`FormaDexDTO.sprite`): o render do HOME sai dele. */
  sprite: string;
  shiny: boolean;
  /** O nome completo, com a forma (`useRotuloForma().nome`). */
  nome: string;
  /** Linhas curtas de contexto, na ordem em que aparecem (estado, caixa · posição…). */
  linhas: readonly string[];
}

/**
 * O conteúdo do cartão. `semNome` quando o nome já está em volta (o título da
 * folha). `children` entra abaixo das linhas: selos, um aviso.
 */
export function CartaoPokemon({
  dados,
  semNome = false,
  tamanhoRender = 180,
  children,
}: {
  dados: DadosCartaoPokemon;
  semNome?: boolean;
  tamanhoRender?: number;
  children?: ReactNode;
}) {
  const t = useTranslations("v2Dex.cartao");
  return (
    <div className={estilos.cartao}>
      {/* eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), um por vez, só de quem a pessoa abriu. */}
      <img
        src={urlRenderHomeDex(dados.sprite, dados.shiny)}
        alt=""
        width={tamanhoRender}
        height={tamanhoRender}
        decoding="async"
        draggable={false}
        className={estilos.render}
      />
      {!semNome && <b className={estilos.cartaoNome}>{dados.nome}</b>}
      {dados.shiny && <span className={estilos.seloShiny}>{t("shiny")}</span>}
      {dados.linhas.length > 0 && (
        <ul className={estilos.cartaoLinhas}>
          {dados.linhas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/**
 * A janela com o cartão. Controlada por `dados`: nulo fecha. As ações da tela
 * vão em `acoes` (o rodapé da folha, sempre à vista no celular);
 * `devolverFocoPara` é o resolvedor da grade virtual, para o foco voltar à
 * vaga certa mesmo que ela tenha saído do DOM (regra 13).
 */
export function FolhaPokemon({
  dados,
  onFechar,
  acoes,
  children,
  devolverFocoPara,
}: {
  dados: DadosCartaoPokemon | null;
  onFechar: () => void;
  acoes?: ReactNode;
  children?: ReactNode;
  devolverFocoPara?: ResolvedorFoco;
}) {
  return (
    <Modal
      aberto={dados !== null}
      onFechar={onFechar}
      titulo={dados?.nome ?? ""}
      rodape={acoes}
      largura={400}
      devolverFocoPara={devolverFocoPara}
    >
      {dados && (
        <CartaoPokemon dados={dados} semNome>
          {children}
        </CartaoPokemon>
      )}
    </Modal>
  );
}

/** Quanto o mouse precisa parar antes de o cartão abrir: passar por cima de uma grade não baixa render nenhum. */
const ESPERA_MS = 250;
const LARGURA_FLUTUANTE = 224;
const ALTURA_FLUTUANTE = 300;
const MARGEM = 12;

/**
 * A pré-visão ao parar o mouse. Uso, na célula:
 *
 * ```tsx
 * const { abrir, fechar, cartao } = useCartaoFlutuante();
 * <button onPointerEnter={abrir(dados)} onPointerLeave={fechar} onClick={() => { fechar(); … }}>
 * …
 * {cartao}
 * ```
 *
 * Só com `pointerType === "mouse"`: no iPhone um toque também dispara os
 * eventos de entrada, e o cartão abriria por cima da folha. Um cartão por
 * tela; rolar a página o fecha (ele ficaria fora do lugar).
 */
export function useCartaoFlutuante(): {
  abrir: (dados: DadosCartaoPokemon) => (e: PointerEvent<HTMLElement>) => void;
  fechar: () => void;
  cartao: ReactNode;
} {
  const [alvo, setAlvo] = useState<(DadosCartaoPokemon & { rect: DOMRect }) | null>(null);
  const relogio = useRef<number | undefined>(undefined);

  const fechar = useCallback(() => {
    window.clearTimeout(relogio.current);
    setAlvo(null);
  }, []);

  const abrir = useCallback(
    (dados: DadosCartaoPokemon) => (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      const rect = e.currentTarget.getBoundingClientRect();
      window.clearTimeout(relogio.current);
      relogio.current = window.setTimeout(() => setAlvo({ ...dados, rect }), ESPERA_MS);
    },
    [],
  );

  useEffect(() => {
    if (!alvo) return;
    window.addEventListener("scroll", fechar, { passive: true, once: true });
    return () => window.removeEventListener("scroll", fechar);
  }, [alvo, fechar]);
  useEffect(() => () => window.clearTimeout(relogio.current), []);

  const cartao = alvo ? <CartaoFlutuante {...alvo} /> : null;
  return { abrir, fechar, cartao };
}

function CartaoFlutuante({ rect, ...dados }: DadosCartaoPokemon & { rect: DOMRect }) {
  const cabeDireita = rect.right + MARGEM + LARGURA_FLUTUANTE < window.innerWidth;
  const left = cabeDireita ? rect.right + MARGEM : Math.max(8, rect.left - MARGEM - LARGURA_FLUTUANTE);
  const top = Math.min(
    Math.max(8, rect.top + rect.height / 2 - ALTURA_FLUTUANTE / 2),
    window.innerHeight - ALTURA_FLUTUANTE - 8,
  );
  return (
    // `aria-hidden`: é a pré-visão do que a célula já diz no rótulo dela; o
    // leitor de tela não ganha nada com uma segunda leitura.
    <div
      className={`${estilos.flutuante} v2-painel-flutuante`}
      style={{ left, top, width: LARGURA_FLUTUANTE }}
      aria-hidden
    >
      <CartaoPokemon dados={dados} />
    </div>
  );
}
