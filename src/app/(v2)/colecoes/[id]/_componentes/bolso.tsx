"use client";

import { ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";
import { urlSpritePokemon } from "@/lib/imagens";

import { Carta } from "../../../_componentes/carta/carta";
import type { PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { nomeTransicaoCarta } from "../../../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../../../_componentes/movimento/transicao-vista";

import estilos from "./colecao.module.css";
import type { GradeFichario } from "./vista-colecao";

/** O que o botão de tirar soma à altura do bolso: 8 px de vão e 44 de alvo. */
export const ALTURA_TIRAR = 52;

/** O atributo com o id da vaga no botão do bolso: é por ele que o foco volta do detalhe. */
export const ATRIBUTO_VAGA = "data-v2-vaga";

/**
 * Um bolso do fichário — a vaga. O mesmo componente serve ao fichário, à
 * lista inteira e ao que falta: Fichário e Set inteiro são a mesma lista de
 * vagas em dois tamanhos (regra "One tree" de `rules.md`), não duas listas.
 *
 * - **Cheio:** a carta da cópia em `low.webp`, com o idioma físico (regra 7)
 *   e o selo de upgrade (só um sinal; a troca é no detalhe, regra 8).
 * - **Vazio de set:** a carta esperada, apagada. **Vazio de Pokédex:** o
 *   sprite da espécie, nunca uma carta (regra 3: a vaga não sabe qual carta
 *   vai entrar). Os dois dizem o número, o nome e quantas cópias livres
 *   cabem nela — a vaga vazia é saída de primeira classe (regra 6).
 * - **Tudo o que o bolso diz também está escrito**: no rótulo do botão para o
 *   leitor de tela e, nas grades largas, em texto visível; nada só no hover
 *   nem só no brilho (regra 1 de `rules.md`). Nas grades densas (5×5, 6×6) a
 *   legenda some e o rótulo do botão continua.
 * - **No modo "Editar cartas"** o bolso ganha embaixo o botão de tirar (44 px
 *   de altura, 8 px abaixo da carta): a célula fica `ALTURA_TIRAR` mais alta.
 * - **A carta aberta no detalhe sai daqui** (fica o lugar dela, do mesmo
 *   tamanho) e só ela leva o nome da transição de vista (regra 25).
 */
export function Bolso({
  vaga,
  tipo,
  densidade,
  aberta,
  noParAtivo,
  celula,
  aoAbrir,
  aoTirar,
}: {
  vaga: VagaGradeV2DTO;
  tipo: TipoColecao;
  /** As colunas do fichário (ou a densidade equivalente da lista inteira): o que cabe escrito. */
  densidade: GradeFichario;
  /** O detalhe desta vaga está aberto. */
  aberta: boolean;
  /** Esta é a carta do par ativo da transição. */
  noParAtivo: boolean;
  /** Na grade virtual: o `tabIndex` e o índice da célula. */
  celula?: PropsCelula;
  aoAbrir: () => void;
  /** Modo "Editar cartas" de um set: tirar a carta da coleção. */
  aoTirar?: () => void;
}) {
  const t = useTranslations("v2Colecao.bolso");
  const tVariante = useTranslations("componentes.variante");
  const cheia = vaga.copia !== undefined;
  const nome = vaga.cartaNome ?? vaga.especie ?? null;
  const livres = vaga.livres ?? 0;
  const naLista = (vaga.escolhas?.length ?? 0) > 0;
  const larga = densidade <= 4;

  const partes = [
    t("numero", { numero: vaga.numero }),
    nome,
    cheia
      ? [vaga.copia!.idioma.toUpperCase(), tVariante.has(vaga.copia!.variante) ? tVariante(vaga.copia!.variante) : vaga.copia!.variante].join(" · ")
      : t("vazia"),
    vaga.upgrade ? t("temUpgrade") : null,
    !cheia && livres > 0 ? t("livres", { total: livres }) : null,
    !cheia && naLista ? t("naLista") : null,
  ].filter(Boolean);

  const sprite = !cheia && tipo === "pokedex" ? urlSpritePokemon(vaga.chave) : null;

  const visual = cheia ? (
    <Carta
      imagemUrl={vaga.imagemUrl ?? null}
      origem={vaga.imagemOrigem ?? null}
      alt=""
      variante={vaga.copia!.variante}
      raridade={vaga.carta?.raridade ?? null}
      mostrarVariante={densidade === 3 && vaga.copia!.variante !== "normal"}
      fallback={<span className={estilos.semImagem}>{nome ?? vaga.numero}</span>}
    />
  ) : sprite ? (
    <span className={estilos.vazioFundo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sprite pequeno do PokeAPI, servido do CDN deles na hora (AGENTS.md, Living Dex). */}
      <img className={estilos.sprite} src={sprite} alt="" width={96} height={96} loading="lazy" decoding="async" draggable={false} />
    </span>
  ) : vaga.imagemUrl ? (
    <Carta
      imagemUrl={vaga.imagemUrl}
      origem={vaga.imagemOrigem ?? null}
      alt=""
      raridade={vaga.carta?.raridade ?? null}
      className={estilos.cartaApagada}
      fallback={<span className={estilos.vazioFundo} />}
    />
  ) : (
    <span className={estilos.vazioFundo} />
  );

  return (
    <div
      className={[estilos.bolso, cheia ? estilos.cheio : estilos.vazio, livres > 0 && !cheia ? estilos.temLivre : null, naLista && !cheia ? estilos.naLista : null]
        .filter(Boolean)
        .join(" ")}
      data-densidade={densidade}
      data-editando={aoTirar ? "" : undefined}
    >
      <button
        type="button"
        className={estilos.alvoBolso}
        aria-label={partes.join(", ")}
        onClick={aoAbrir}
        {...{ [ATRIBUTO_VAGA]: vaga.id }}
        {...celula}
      >
        {aberta ? (
          <span className={estilos.lugarAberto} aria-hidden />
        ) : (
          // Fora do par ativo, `default="none"`: sem nome, o React daria um nome
          // automático a cada carta e animaria todas (orçamento, regra 5).
          <TransicaoVista name={nomeTransicaoCarta(vaga.id, noParAtivo)} default={noParAtivo ? undefined : "none"}>
            <span className={estilos.visual} aria-hidden>
              {visual}
            </span>
          </TransicaoVista>
        )}
        {!cheia && (
          <span className={estilos.legendaVazia} aria-hidden>
            <span className={`${estilos.numeroVazio} v2-num`}>{vaga.numero}</span>
            {larga && nome && <span className={estilos.nomeVazio}>{nome}</span>}
            {larga && livres > 0 && <span className={`${estilos.pilula} ${estilos.pilulaLivre}`}>{t("livresCurto", { total: livres })}</span>}
            {larga && naLista && livres === 0 && <span className={`${estilos.pilula} ${estilos.pilulaLista}`}>{t("naLista")}</span>}
          </span>
        )}
        {cheia && larga && (
          <span className={`${estilos.seloNumero} v2-num`} aria-hidden>
            {vaga.numero}
          </span>
        )}
        {cheia && larga && (
          <span className={`${estilos.seloIdioma} v2-num`} aria-hidden>
            {vaga.copia!.idioma.toUpperCase()}
          </span>
        )}
        {vaga.upgrade && (
          <span className={estilos.seloUpgrade} aria-hidden>
            <ArrowUp />
          </span>
        )}
      </button>
      {/* "Editar cartas": um botão próprio embaixo da carta, 8 px abaixo dela —
          nunca por cima, onde dividiria o toque com o de abrir. */}
      {aoTirar && (
        <button
          type="button"
          className={estilos.tirar}
          aria-label={t("tirar", { alvo: nome ?? t("numero", { numero: vaga.numero }) })}
          onClick={aoTirar}
        >
          <X aria-hidden />
          <span>{t("tirarCurto")}</span>
        </button>
      )}
    </div>
  );
}
