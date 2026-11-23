"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, memo } from "react";

import type { DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import { MAX_QUANTIDADE_POR_LINHA } from "@/lib/dominio/dex-registro";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";

import { ATRIBUTO_CELULA, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { SpriteDex } from "../../_componentes/sprite-dex";

import estilos from "./cadastro.module.css";
import { ajustarQuantidade, quantidadeDoTexto, type SeloCadastro, selosDaForma } from "./lote-dex";

/**
 * A altura de cada célula, em px, igual em toda largura: a grade virtual põe
 * cada linha pela conta, sem medir (`cadastro.module.css`, `.celula`).
 */
export const ALTURA_CELULA = 198;

/** O atributo de cada campo de quantidade, `formaId:trilha`: é por ele que o Enter acha o da próxima forma. */
export const ATRIBUTO_QUANTIDADE = "data-quantidade-de";
/** O atributo da raiz da célula com o id da forma: é por ele que a tela sabe qual linha tem o foco. */
export const ATRIBUTO_FORMA = "data-forma";

export function numeroDexTexto(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

interface PropsCelulaForma {
  forma: FormaDexDTO;
  /** O rótulo da forma na tela (`useRotuloForma().forma`), ou nulo. */
  rotulo: string | null;
  /** "Espécie (forma)" (`useRotuloForma().nome`). */
  nome: string;
  /** Estáveis por jogo: a célula tira deles as marcas (`selosDaForma`). */
  catalogo: ReadonlyMap<string, DisponibilidadeForma> | null;
  trancadas: ReadonlyMap<number, string>;
  normal: number;
  shiny: number;
  tenhoNormal: number;
  tenhoShiny: number;
  celula: PropsCelula;
  /**
   * O foco está dentro da lista: todo campo entra no Tab (normal → shiny →
   * forma seguinte). Fora dela, só os da célula de entrada da grade
   * (`celula.tabIndex`), para o Tab de fora entrar na primeira forma à vista e
   * não num campo de uma linha de sobra, fora da tela.
   */
  tabulavel: boolean;
  aoMudar: (formaId: string, trilha: TrilhaDex, valor: number) => void;
  aoEnter: (formaId: string, trilha: TrilhaDex) => void;
  aoAbrir: (formaId: string) => void;
}

/** "Tenho: 2 normal · 1 shiny", só com as trilhas que têm algum; nulo sem registro. */
export function textoTenho(
  t: (chave: "tenho" | "tenhoNormal" | "tenhoShiny", valores?: Record<string, number | string>) => string,
  normal: number,
  shiny: number,
): string | null {
  if (normal + shiny === 0) return null;
  const partes = [
    normal > 0 ? t("tenhoNormal", { n: normal }) : null,
    shiny > 0 ? t("tenhoShiny", { n: shiny }) : null,
  ].filter((p): p is string => p !== null);
  return t("tenho", { partes: partes.join(" · ") });
}

/** O texto de uma marca; a mesma frase vai à célula, ao rótulo acessível e ao cartão. */
export function useTextoSelo() {
  const td = useTranslations("dex");
  return (s: SeloCadastro): string => {
    switch (s.tipo) {
      case "foraDoJogo":
        return td("cadastrar.foraDoJogo");
      case "como":
        return td(`cadastrar.como.${s.como}`);
      case "trancada":
        return td("cadastrar.trancada", { checkpoint: s.checkpoint });
      case "naoVaiAoHome":
        return td("cadastrar.naoVaiAoHome");
      case "semShiny":
        return td("pokedex.semShiny");
    }
  };
}

/**
 * Uma forma na lista do cadastro: o nome (toque abre o cartão do Pokémon), a
 * linha de marcas e as duas quantidades, normal e shiny, cada uma entre − e +.
 *
 * - **O botão do nome é o elemento da célula na grade** (`celula`): as setas
 *   andam de forma em forma por ele, e é ele que abre o cartão com as marcas
 *   por extenso — a linha de marcas corta com reticências para a célula ter
 *   altura fixa, e nada fica só no corte (AGENTS.md, "Nothing only on hover
 *   or in `title`").
 * - **Com o foco na lista, os campos ficam na ordem do Tab em todas as
 *   linhas**, como na tabela da v1: o Tab vai de normal a shiny e à forma
 *   seguinte, e o navegador rola o campo para a vista, o que monta as linhas
 *   seguintes da grade. De fora, o Tab entra pela célula de entrada da grade
 *   (`tabulavel`). O Enter vai
 *   ao mesmo campo da forma seguinte. − e + ficam fora do Tab: o teclado
 *   digita o número.
 * - **Quantidades controladas**: o número mora no lote da tela, nunca aqui. A
 *   célula sai da faixa montada e volta, o celular gira e cruza 768 px, e o
 *   digitado continua (AGENTS.md, "Quantity steppers").
 * - **Poucos nós por célula** (~20): − e + são texto, não ícone SVG, e a seta
 *   do botão do nome é um pseudo-elemento. A célula é contada no orçamento de
 *   nós da regra 13, e o limiar desta lista sai dessa conta (`rules.md`,
 *   "Register by game (package 5c)").
 * - Nada só na cor: "fora do jogo", "troca", "trancada" e "não vai ao HOME"
 *   são texto; o destaque da linha marcada repete o número do campo.
 */
export const CelulaForma = memo(function CelulaForma({
  forma,
  rotulo,
  nome,
  catalogo,
  trancadas,
  normal,
  shiny,
  tenhoNormal,
  tenhoShiny,
  celula,
  tabulavel,
  aoMudar,
  aoEnter,
  aoAbrir,
}: PropsCelulaForma) {
  const t = useTranslations("v2DexCadastrar");
  const td = useTranslations("dex");
  const textoSelo = useTextoSelo();
  const selos = selosDaForma(forma, catalogo, trancadas);
  const textos = selos.map(textoSelo);
  const tenho = textoTenho(t, tenhoNormal, tenhoShiny);
  const numero = numeroDexTexto(forma.numero);
  const rotuloAcessivel = [nome, numero, tenho ?? t("nenhumRegistro"), ...textos].join(" — ");

  const passo = (trilha: TrilhaDex, valor: number) => {
    const nomeTrilha = td(`cadastrar.col${trilha === "normal" ? "Normal" : "Shiny"}`);
    const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      aoEnter(forma.id, trilha);
    };
    return (
      <div className={estilos.passo}>
        <span className={estilos.passoRotulo} aria-hidden>
          {nomeTrilha}
        </span>
        <button
          type="button"
          className={estilos.passoBotao}
          tabIndex={-1}
          disabled={valor === 0}
          aria-label={t("menos", { nome, trilha: nomeTrilha })}
          onClick={() => aoMudar(forma.id, trilha, ajustarQuantidade(valor, -1))}
        >
          −
        </button>
        <input
          {...{ [ATRIBUTO_QUANTIDADE]: `${forma.id}:${trilha}` }}
          className={`${estilos.quantidade} v2-num`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="next"
          autoComplete="off"
          maxLength={3}
          placeholder="0"
          aria-label={t("quantidade", { nome, trilha: nomeTrilha })}
          tabIndex={tabulavel ? 0 : celula.tabIndex}
          value={valor > 0 ? String(valor) : ""}
          onChange={(e) => aoMudar(forma.id, trilha, quantidadeDoTexto(e.target.value))}
          onFocus={(e) => e.target.select()}
          onKeyDown={aoTeclar}
        />
        <button
          type="button"
          className={estilos.passoBotao}
          tabIndex={-1}
          disabled={valor >= MAX_QUANTIDADE_POR_LINHA}
          aria-label={t("mais", { nome, trilha: nomeTrilha })}
          onClick={() => aoMudar(forma.id, trilha, ajustarQuantidade(valor, 1))}
        >
          +
        </button>
      </div>
    );
  };

  return (
    <div
      {...{ [ATRIBUTO_FORMA]: forma.id }}
      className={`${estilos.celula} v2-painel`}
      data-marcada={normal + shiny > 0 || undefined}
    >
      <button
        type="button"
        {...celula}
        className={estilos.cabeca}
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        onClick={() => aoAbrir(forma.id)}
      >
        <SpriteDex sprite={forma.sprite} shiny={false} tamanho={48} />
        <span className={estilos.cabecaTexto}>
          <span className={estilos.especie}>{forma.especie}</span>
          <span className={estilos.linhaForma}>
            <span className="v2-num">{numero}</span>
            {rotulo ? <span> · {rotulo}</span> : null}
          </span>
        </span>
      </button>

      <p className={estilos.selos} aria-hidden>
        {tenho ? <span className={estilos.seloTenho}>{tenho}</span> : null}
        {selos.map((s, i) => (
          <span key={s.tipo} className={estilos.selo} data-tipo={s.tipo}>
            {textos[i]}
          </span>
        ))}
      </p>

      {passo("normal", normal)}
      {passo("shiny", shiny)}
    </div>
  );
}, mesmasProps);

/*
 * A grade cria um `celula` novo a cada render; comparar pelo conteúdo dele
 * deixa o `memo` valer, e digitar numa forma não redesenha as outras (o lote
 * troca só a linha tocada). Com HOME são ~1.220 formas: era o que fazia o
 * toque no stepper custar caro na v1.
 */
function mesmasProps(a: PropsCelulaForma, b: PropsCelulaForma): boolean {
  return (
    a.forma === b.forma &&
    a.rotulo === b.rotulo &&
    a.nome === b.nome &&
    a.catalogo === b.catalogo &&
    a.trancadas === b.trancadas &&
    a.normal === b.normal &&
    a.shiny === b.shiny &&
    a.tenhoNormal === b.tenhoNormal &&
    a.tenhoShiny === b.tenhoShiny &&
    a.celula.tabIndex === b.celula.tabIndex &&
    a.celula[ATRIBUTO_CELULA] === b.celula[ATRIBUTO_CELULA] &&
    a.tabulavel === b.tabulavel &&
    a.aoMudar === b.aoMudar &&
    a.aoEnter === b.aoEnter &&
    a.aoAbrir === b.aoAbrir
  );
}
