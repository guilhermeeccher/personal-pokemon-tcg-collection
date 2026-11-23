"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { CartaDoInicioV2 } from "@/lib/dominio/inicio-v2";

import { Carta, type ModoCarta } from "../_componentes/carta/carta";
import type { QualidadeImagem } from "../_componentes/carta/imagem-carta";
import { nomeTransicaoCarta } from "../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../_componentes/movimento/transicao-vista";
import estilos from "./inicio.module.css";
import type { CartasDoInicio } from "./tipos";

/**
 * Uma carta do início que abre o detalhe: o botão inteiro é o alvo de toque,
 * com o rótulo dizendo o que abre. A variante da cópia também é texto, nunca
 * só o brilho (regra 1 de `rules.md`): no rótulo, e à vista na legenda de
 * quem a escreve ou sobre a carta (`mostrarVariante`).
 *
 * Enquanto o detalhe dela está aberto, a carta sai daqui e fica o lugar dela,
 * do mesmo tamanho: o nome de transição só pode existir num elemento, e é o
 * do palco do detalhe que o leva.
 *
 * Fora do par ativo, a carta não leva nome nem transição nenhuma: sem nome, o
 * React daria um nome automático a cada carta e animaria todas (orçamento de
 * composição, regra 5 de `rules.md`).
 */
export function CartaTocavel({
  chave,
  carta,
  cartas,
  rotulo,
  modo = "grade",
  qualidade = "low",
  mostrarVariante = false,
  className,
  children,
}: {
  chave: string;
  carta: CartaDoInicioV2;
  cartas: CartasDoInicio;
  rotulo: string;
  modo?: ModoCarta;
  qualidade?: QualidadeImagem;
  /** A variante escrita sobre a carta, quando a legenda não a escreve. */
  mostrarVariante?: boolean;
  className?: string;
  /** Legenda abaixo da carta, dentro do mesmo botão. */
  children?: ReactNode;
}) {
  const tc = useTranslations("componentes");
  const noParAtivo = cartas.alvo === chave;
  // O `aria-label` substitui o nome do que está dentro do botão, inclusive o
  // texto da variante que a `<Carta>` dá ao leitor de tela: ela vai junto aqui.
  const rotuloCompleto = `${rotulo} · ${tc(`variante.${carta.variante}`)}`;
  return (
    <button
      type="button"
      className={[estilos.cartaTocavel, className].filter(Boolean).join(" ")}
      onClick={() => cartas.abrir(chave, carta)}
      aria-label={rotuloCompleto}
    >
      {cartas.aberta === chave ? (
        <span className={estilos.lugarDaCarta} aria-hidden />
      ) : (
        <TransicaoVista name={nomeTransicaoCarta(chave, noParAtivo)} default={noParAtivo ? undefined : "none"}>
          <Carta
            imagemUrl={carta.imagemUrl}
            origem={carta.imagemOrigem}
            alt={carta.nome}
            variante={carta.variante}
            raridade={carta.raridade}
            modo={modo}
            qualidade={qualidade}
            mostrarVariante={mostrarVariante}
            fallback={<span className={estilos.semImagem}>{carta.nome}</span>}
          />
        </TransicaoVista>
      )}
      {children}
    </button>
  );
}
