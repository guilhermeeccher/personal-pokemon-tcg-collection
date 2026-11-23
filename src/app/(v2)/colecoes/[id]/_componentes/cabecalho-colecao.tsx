"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import type { Divisao } from "@/lib/dominio/divisoes-colecao";
import { progressoDaColecao } from "@/lib/dominio/lista-colecoes-v2";
import type { GradeColecaoV2DTO } from "@/lib/dominio/tipos-cliente";

import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";

/**
 * O cabeçalho da coleção (CID-01, CID-03): voltar, o nome, o que ela é, o
 * progresso e as divisões. O progresso conta a numeração oficial (regra 4;
 * as secretas só com a chave ligada) e a customizada não tem denominador — só
 * "N cartas". As divisões (regiões de uma Pokédex, os sets e as secretas de
 * um set) levam à página ou ao ponto da lista onde começam: o filtro por
 * região da v1 virou navegação, e nenhuma vaga some da tela.
 *
 * Os avisos de catálogo são os da v1, com as mesmas contas: o de catálogo
 * incompleto mede o catálogo, não as vagas.
 */
export function CabecalhoColecao({
  colecao,
  rotuloDoTema,
  acoes,
  aoIrParaDivisao,
}: {
  colecao: GradeColecaoV2DTO;
  /** O tema da temática, já no idioma da tela; nulo se não é temática. */
  rotuloDoTema: string | null;
  acoes: ReactNode;
  aoIrParaDivisao: (divisaoId: string) => void;
}) {
  const t = useTranslations("v2Colecao.cabecalho");
  const tDivisoes = useTranslations("divisoes");
  const progresso = progressoDaColecao(colecao);
  const parametroSet =
    colecao.tipo === "set" ? (colecao.parametro as { incluirSecretas?: boolean; idiomaCatalogo?: string } | null) : null;

  const chips = [
    t(`tipo.${colecao.tipo}`),
    rotuloDoTema ? t("tema", { tema: rotuloDoTema }) : null,
    parametroSet?.idiomaCatalogo ? t("catalogo", { idioma: parametroSet.idiomaCatalogo.toUpperCase() }) : null,
    parametroSet ? (parametroSet.incluirSecretas ? t("comSecretas") : t("semSecretas")) : null,
    colecao.idiomaExigido ? t("idiomaExigido", { idioma: colecao.idiomaExigido.toUpperCase() }) : null,
  ].filter((c): c is string => c !== null);

  const nomeDaDivisao = (d: Divisao) =>
    d.tipo === "regiao" ? NOME_REGIAO[d.regiao] : d.parte === "inteiro" ? d.setNome : `${d.setNome} · ${tDivisoes(d.parte)}`;

  // Numa coleção que junta sets, o aviso de "sem numeração oficial" nomeia o set.
  const nomePorSet = new Map(colecao.divisoes.flatMap((d) => (d.tipo === "set" ? [[d.setId, d.setNome] as const] : [])));
  const setsSemNumeracao = (colecao.avisoSemNumeracaoOficial?.setIds ?? []).map((s) => nomePorSet.get(s) ?? s);

  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.cabecalhoTopo}>
        <div className={estilos.cabecalhoTexto}>
          <Link href="/colecoes" className={estilos.migalha}>
            <ChevronLeft aria-hidden />
            {t("colecoes")}
          </Link>
          <h1 className={estilos.titulo}>{colecao.nome}</h1>
          <ul className={estilos.chips}>
            {chips.map((c) => (
              <li key={c} className={estilos.chip}>
                {c}
              </li>
            ))}
          </ul>
          {colecao.notas && <p className={estilos.notas}>{colecao.notas}</p>}
        </div>
        <div className={estilos.progresso}>
          {progresso.tipo === "anel" && (
            <>
              <span
                className={[estilos.anel, progresso.completa ? estilos.anelCompleto : null].filter(Boolean).join(" ")}
                style={{ "--p": progresso.percentual } as CSSProperties}
                aria-hidden
              >
                <span className="v2-num">{progresso.percentual}%</span>
              </span>
              <span className={estilos.numerosProgresso}>
                <b className="v2-num">{t("deTotal", { preenchidas: colecao.vagasPreenchidas, total: colecao.totalVagas })}</b>
                <span>{colecao.tipo === "pokedex" ? t("especies") : t("numeracaoOficial")}</span>
                {progresso.faltam > 0 ? <span className={estilos.faltam}>{t("vazias", { total: progresso.faltam })}</span> : <span className={estilos.completaTexto}>{t("completa")}</span>}
              </span>
            </>
          )}
          {progresso.tipo === "contagem" && (
            <span className={estilos.numerosProgresso}>
              <b className="v2-num">{t("cartas", { total: progresso.quantas })}</b>
              <span>{t("semDenominador")}</span>
            </span>
          )}
          {progresso.tipo === "semVagas" && <span className={estilos.mudo}>{t("semVagas")}</span>}
        </div>
      </div>

      <div className={estilos.acoesColecao}>{acoes}</div>

      {colecao.divisoes.length > 1 && (
        <nav aria-label={colecao.tipo === "pokedex" ? t("regioes") : t("divisoes")}>
          <ul className={estilos.divisoes}>
            {colecao.divisoes.map((d) => (
              <li key={d.id}>
                <button type="button" className={estilos.divisao} onClick={() => aoIrParaDivisao(d.id)}>
                  <span className={estilos.nomeDivisao}>{nomeDaDivisao(d)}</span>
                  <span className="v2-num">
                    {d.preenchidas}/{d.total}
                  </span>
                  <span className={estilos.barraDivisao} style={{ "--p": d.total > 0 ? d.preenchidas / d.total : 0 } as CSSProperties} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {colecao.avisoCatalogoIncompleto && (
        <AvisoEmLinha tom="alerta" titulo={t("catalogoIncompleto")}>
          {t("catalogoIncompletoTexto", {
            materializadas: colecao.avisoCatalogoIncompleto.vagasMaterializadas,
            esperadas: colecao.avisoCatalogoIncompleto.vagasEsperadas,
            faltantes: colecao.avisoCatalogoIncompleto.vagasFaltantes,
          })}
        </AvisoEmLinha>
      )}
      {colecao.avisoSemNumeracaoOficial && (
        <AvisoEmLinha tom="alerta" titulo={t("semNumeracao")}>
          {colecao.multiplosSets && setsSemNumeracao.length > 0
            ? t("semNumeracaoDoSet", { sets: setsSemNumeracao.join(", "), total: colecao.avisoSemNumeracaoOficial.qtdTotal })
            : t("semNumeracaoTexto", { total: colecao.avisoSemNumeracaoOficial.qtdTotal })}
        </AvisoEmLinha>
      )}
    </header>
  );
}
