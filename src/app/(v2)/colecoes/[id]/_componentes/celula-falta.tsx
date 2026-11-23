"use client";

import { Check, Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { VagaFaltaV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";
import { urlSpritePokemon } from "@/lib/imagens";

import { Carta } from "../../../_componentes/carta/carta";
import type { Formatos } from "../../../_componentes/detalhe/formatos";
import { ATRIBUTO_CELULA, type PropsCelula } from "../../../_componentes/grade/grade-virtual";
import { nomeTransicaoCarta } from "../../../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../../../_componentes/movimento/transicao-vista";

import type { AcaoDoToque } from "./compra-falta";
import estilos from "./falta.module.css";
import type { GradeFichario } from "./vista-colecao";

/** O atributo da carta, o alvo do gesto de compra: o arrasto só começa nela. */
export const ATRIBUTO_ALVO_COMPRA = "data-v2-alvo-compra";

/** O que a legenda soma à altura da célula: o botão de detalhes (44 px, 8 acima) e, nas grades largas, a linha do nome. */
export function alturaDaLegenda(densidade: GradeFichario): number {
  return densidade <= 4 ? 44 + 8 + 20 : 44 + 8;
}

/**
 * Uma vaga vazia na aba "O que falta". Dois alvos, um embaixo do outro, com
 * 8 px entre eles (nunca um sobre o outro):
 *
 * - **a carta** faz o gesto de compra — no set, põe e tira da lista
 *   (`aria-pressed`); na Pokédex, abre as opções; na vaga com cópia livre,
 *   abre o detalhe para alocar (`acaoDoToque`);
 * - **"Detalhes"** abre o detalhe da carta (o mesmo da página inteira).
 *
 * Fora da lista a carta esperada do set fica apagada, e marcar devolve a cor
 * a ela — a marca também está escrita (o selo e o rótulo), nunca só na cor.
 * A célula não guarda estado: a marca vem de quem a desenha, por vaga.
 */
export function CelulaFalta({
  vaga,
  tipo,
  densidade,
  falta,
  naLista,
  pendente,
  acao,
  aberta,
  noParAtivo,
  celula,
  formatos,
  aoTocar,
  aoDetalhes,
}: {
  vaga: VagaGradeV2DTO;
  tipo: TipoColecao;
  densidade: GradeFichario;
  falta: VagaFaltaV2DTO | undefined;
  naLista: boolean;
  /** A marca ainda não foi relida do servidor. */
  pendente: boolean;
  acao: AcaoDoToque["tipo"];
  aberta: boolean;
  noParAtivo: boolean;
  celula: PropsCelula;
  formatos: Formatos;
  aoTocar: () => void;
  aoDetalhes: () => void;
}) {
  const t = useTranslations("v2Falta.celula");
  const nome = vaga.cartaNome ?? vaga.especie ?? falta?.rotulo ?? null;
  const livres = vaga.livres ?? 0;
  const larga = densidade <= 4;
  const escolhas = falta?.escolhas ?? [];
  // O preço que a vaga mostra: o da carta na lista, ou o da que o atalho proporia.
  const preco = naLista ? (escolhas[0]?.preco ?? (pendente ? (falta?.proposta?.preco ?? null) : null)) : (falta?.proposta?.preco ?? null);
  const alterna = acao === "marcar" || acao === "desmarcar";

  const partes = [
    t("numero", { numero: vaga.numero }),
    nome,
    naLista ? (escolhas.length > 1 ? t("variasNaLista", { total: escolhas.length }) : t("naLista")) : t("foraDaLista"),
    preco ? formatos.brl(preco.valor) : null,
    livres > 0 ? t("livres", { total: livres }) : null,
    pendente ? t("salvando") : null,
    acao === "abrirOpcoes" ? t("abreOpcoes") : acao === "abrirDetalhe" ? t("abreDetalhe") : null,
  ].filter(Boolean);

  const sprite = tipo === "pokedex" ? urlSpritePokemon(vaga.chave) : null;
  const visual = sprite ? (
    <span className={estilos.fundoVazio}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sprite pequeno do PokeAPI, servido do CDN deles na hora (AGENTS.md, Living Dex). */}
      <img className={estilos.sprite} src={sprite} alt="" width={96} height={96} loading="lazy" decoding="async" draggable={false} />
    </span>
  ) : vaga.imagemUrl ? (
    <Carta
      imagemUrl={vaga.imagemUrl}
      origem={vaga.imagemOrigem ?? null}
      alt=""
      raridade={vaga.carta?.raridade ?? null}
      className={naLista ? undefined : estilos.cartaApagada}
      fallback={<span className={estilos.fundoVazio}>{nome ? <span className={estilos.semImagem}>{nome}</span> : null}</span>}
    />
  ) : (
    <span className={estilos.fundoVazio}>{nome ? <span className={estilos.semImagem}>{nome}</span> : null}</span>
  );

  return (
    <div
      className={[estilos.celula, naLista ? estilos.naLista : null, livres > 0 ? estilos.temLivre : null, pendente ? estilos.pendente : null]
        .filter(Boolean)
        .join(" ")}
      data-densidade={densidade}
    >
      <button
        type="button"
        className={estilos.alvoCarta}
        aria-label={partes.join(", ")}
        aria-pressed={alterna ? naLista : undefined}
        aria-haspopup={acao === "abrirOpcoes" || acao === "abrirDetalhe" ? "dialog" : undefined}
        onClick={aoTocar}
        {...{ [ATRIBUTO_ALVO_COMPRA]: "" }}
        {...celula}
      >
        {aberta ? (
          <span className={estilos.lugarAberto} aria-hidden />
        ) : (
          // Só a carta do par ativo leva nome de transição (regra 25); as outras, `none`.
          <TransicaoVista name={nomeTransicaoCarta(vaga.id, noParAtivo)} default={noParAtivo ? undefined : "none"}>
            <span className={estilos.visual} aria-hidden>
              {visual}
            </span>
          </TransicaoVista>
        )}
        <span className={estilos.seloNumero} aria-hidden>
          <span className="v2-num">{vaga.numero}</span>
        </span>
        {naLista ? (
          <span className={estilos.marca} aria-hidden>
            <Check />
          </span>
        ) : null}
        {livres > 0 && larga ? (
          <span className={estilos.pilulaLivre} aria-hidden>
            {t("livresCurto", { total: livres })}
          </span>
        ) : null}
      </button>
      {larga ? (
        <span className={estilos.legendaNome} aria-hidden>
          {nome ?? "—"}
        </span>
      ) : null}
      <div className={estilos.rodapeCelula}>
        {larga ? (
          <span className={`${estilos.precoCelula} v2-num`} aria-hidden>
            {preco ? formatos.brl(preco.valor) : naLista ? "" : falta && falta.opcoes === 0 ? t("semOpcaoCurto") : ""}
          </span>
        ) : null}
        <button
          type="button"
          className={estilos.detalhes}
          aria-label={t("detalhesDe", { alvo: nome ?? t("numero", { numero: vaga.numero }) })}
          // O mesmo `tabIndex` e o mesmo índice da carta: entrar na grade por
          // Shift+Tab cai aqui, e a grade virtual reconhece a célula pelo
          // índice (é a carta, a primeira com ele, que ela foca nas setas).
          tabIndex={celula.tabIndex}
          {...{ [ATRIBUTO_CELULA]: celula[ATRIBUTO_CELULA] }}
          onClick={aoDetalhes}
        >
          <Ellipsis aria-hidden />
          {densidade <= 3 ? <span>{t("detalhes")}</span> : null}
        </button>
      </div>
    </div>
  );
}
