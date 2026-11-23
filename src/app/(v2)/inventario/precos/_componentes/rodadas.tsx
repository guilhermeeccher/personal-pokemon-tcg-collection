"use client";

/**
 * As rodadas já feitas ("Pesquisas anteriores") da fonte ativa, e o botão de
 * excluir cada uma. Excluir apaga o registro da rodada e o ponto dela no
 * gráfico; **os preços que ela trouxe ficam** — uma linha de preço achada
 * nunca é apagada por isto (AGENTS.md, "Special card prices"). Quem pergunta
 * "tem certeza?" é a tela, pelo diálogo de confirmação; aqui só se avisa que
 * o usuário quer excluir.
 *
 * Uma rodada viva não se exclui: o botão fica desligado e a situação diz por
 * quê. O motivo de uma interrupção (um bloqueio da Liga, por exemplo) é uma
 * frase longa: abre por toque e teclado ao lado do selo, e não num `title`.
 */

import { useLocale, useTranslations } from "next-intl";

import type { RodadaListadaDTO } from "@/lib/dominio/precos-v2";

import { Botao } from "../../../_componentes/primitivos/botao";
import { Painel } from "../../../_componentes/primitivos/painel";

import { Explicacao } from "../../../_componentes/primitivos/explicacao";
import estilos from "./precos.module.css";

export function Rodadas({
  rodadas,
  excluindo,
  aoExcluir,
}: {
  rodadas: readonly RodadaListadaDTO[];
  /** O id da rodada que está sendo excluída; enquanto houver, nenhuma outra se exclui. */
  excluindo: string | null;
  aoExcluir: (rodada: RodadaListadaDTO) => void;
}) {
  const t = useTranslations("v2Precos.rodadas");
  const locale = useLocale();
  const brl = (v: number) => v.toLocaleString(locale, { style: "currency", currency: "BRL" });
  const quando = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

  return (
    <section className={estilos.secao}>
      <h2 className={estilos.subtitulo}>{t("titulo")}</h2>
      <p className={estilos.aviso}>{t("explicacao")}</p>
      {rodadas.length === 0 ? (
        <Painel className={estilos.vazio}>{t("vazio")}</Painel>
      ) : (
        <div className={estilos.rodadas}>
          <div className={estilos.cabecalhoRodadas} aria-hidden>
            <span>{t("colunaData")}</span>
            <span>{t("colunaSituacao")}</span>
            <span className={estilos.colDireita}>{t("colunaCartas")}</span>
            <span className={estilos.colDireita}>{t("colunaRequisicoes")}</span>
            <span className={estilos.colDireita}>{t("colunaTotal")}</span>
            <span />
          </div>
          <ul className={estilos.linhas}>
            {rodadas.map((r) => {
              const viva = r.concluidaEm === null;
              const tom = viva ? "aviso" : r.erro ? "perigo" : "neutro";
              const rotuloSituacao = viva ? t("emAndamento") : r.erro ? t("interrompida") : t("concluida");
              return (
                <li key={r.id} className={`v2-painel ${estilos.rodada}`}>
                  <span className={`${estilos.rodadaData} v2-num`}>{quando(r.criadoEm)}</span>
                  <span className={estilos.rodadaSituacao}>
                    <span className={estilos.selo} data-tom={tom}>
                      {rotuloSituacao}
                    </span>
                    {r.erro && (
                      <Explicacao assunto={t("motivo")} texto={r.erro} tom="perigo">
                        {t("motivo")}
                      </Explicacao>
                    )}
                  </span>
                  <span className={`${estilos.rodadaCartas} v2-num`}>
                    <span className={estilos.rotuloCampo}>{t("colunaCartas")} </span>
                    {t("cartas", { feitas: r.cartasConsultadas, total: r.totalCartas })}
                  </span>
                  <span className={`${estilos.rodadaRequisicoes} v2-num`}>
                    <span className={estilos.rotuloCampo}>{t("colunaRequisicoes")} </span>
                    {r.requisicoes}
                  </span>
                  <span className={`${estilos.rodadaTotal} v2-num`}>
                    <span className={estilos.rotuloCampo}>{t("colunaTotal")}</span>
                    {r.somaMedios === null ? (
                      t("semPonto")
                    ) : r.noGrafico ? (
                      brl(r.somaMedios)
                    ) : (
                      <span className={estilos.foraDoGrafico}>
                        {brl(r.somaMedios)}
                        <span className={estilos.detalhePreco}>{t("foraDoGrafico")}</span>
                      </span>
                    )}
                  </span>
                  <span className={estilos.rodadaAcao}>
                    <Botao
                      variante="perigo"
                      pequeno
                      carregando={excluindo === r.id}
                      disabled={viva || excluindo !== null}
                      aria-label={t("excluirRotulo", { data: quando(r.criadoEm) })}
                      onClick={() => aoExcluir(r)}
                    >
                      {excluindo === r.id ? t("excluindo") : t("excluir")}
                    </Botao>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
