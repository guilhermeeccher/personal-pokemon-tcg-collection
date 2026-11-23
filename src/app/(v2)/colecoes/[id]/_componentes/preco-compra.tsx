"use client";

import { useTranslations } from "next-intl";

import type { CriterioDaPropostaV2DTO, PrecoReferenciaV2DTO } from "@/lib/dominio/tipos-cliente";

import type { Formatos } from "../../../_componentes/detalhe/formatos";

import estilos from "./falta.module.css";

/**
 * O preço de uma opção de compra, sempre com a fonte e a data (seção
 * "International price reference" do `AGENTS.md`): no Cardmarket, o valor em
 * reais com o euro, a PTAX e o dia dela, e o critério quando não é a
 * tendência; na Liga, o menor preço com estoque que a varredura viu, sem
 * conversão. As duas fontes nunca aparecem juntas — a leitura só traz a da
 * instalação. Tudo em texto visível: nada só no hover.
 */
export function LinhaPreco({
  preco,
  consultadaSemPrecoEm,
  formatos,
}: {
  preco: PrecoReferenciaV2DTO | null;
  consultadaSemPrecoEm?: string;
  formatos: Formatos;
}) {
  const t = useTranslations("v2Falta.preco");
  if (!preco) {
    return (
      <span className={estilos.sutil}>
        {consultadaSemPrecoEm ? t("semPrecoNoCardmarket", { data: formatos.instante(consultadaSemPrecoEm) }) : t("semPreco")}
      </span>
    );
  }
  const cm = preco.cardmarket;
  return (
    <span className={estilos.linhaPreco}>
      <b className="v2-num">{formatos.brl(preco.valor)}</b>{" "}
      <span className={estilos.etiquetaFonte}>{preco.fonte === "cardmarket" ? t("fonteCardmarket") : t("fonteLiga")}</span>
      {preco.fonte === "cardmarket" && cm ? (
        <span className={estilos.sutil}>
          {cm.valorEur !== null && cm.cotacao !== null && cm.cotacaoData !== null
            ? t("conversao", { eur: formatos.eur(cm.valorEur), cotacao: formatos.cotacao(cm.cotacao), data: formatos.dia(cm.cotacaoData) })
            : null}
          {cm.criterioValor === "media30" && cm.tendenciaEur != null ? ` ${t("media30", { tendencia: formatos.eur(cm.tendenciaEur) })}` : null}
          {cm.criterioValor === "media" ? ` ${t("media")}` : null}
        </span>
      ) : null}
      {preco.fonte === "liga" ? (
        <span className={estilos.sutil}>{preco.em ? t("ligaEm", { data: formatos.instante(preco.em) }) : t("liga")}</span>
      ) : null}
    </span>
  );
}

/** O critério que ordena as opções e decide o atalho, em uma frase. */
export function textoDoCriterio(
  t: ReturnType<typeof useTranslations>,
  criterio: CriterioDaPropostaV2DTO,
  formatos: Formatos,
): string {
  return t("linha", {
    ordem: criterio.ordenacao === "preco" ? t("preco") : t("preferencia"),
    teto: criterio.tetoPreco === null ? t("semTeto") : t("teto", { valor: formatos.brl(criterio.tetoPreco) }),
    origem: t(`origem.${criterio.origem}`),
  });
}
