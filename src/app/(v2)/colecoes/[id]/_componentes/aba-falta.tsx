"use client";

/**
 * A aba "O que falta" da coleção — **o ponto de encaixe do pacote 1e**.
 *
 * O pacote 1d entrega a estrutura: a aba existe, conta as vagas vazias, e o
 * conteúdo dela é este componente. Até o 1e chegar, ele mostra as vagas
 * vazias (regra 6: o que falta é a razão de ser do sistema) na mesma grade
 * virtual da lista inteira, cada uma abrindo o detalhe, e um "Fazer na v1"
 * para marcar compras, copiar a lista e ver as opções de compra, que ainda
 * moram na tela da coleção da v1.
 *
 * ## O contrato com o 1e
 *
 * O 1e substitui o corpo de `AbaFalta` mantendo a assinatura (`ContextoAbaFalta`)
 * e preenche `secaoCompraDoDetalhe`, que a página passa ao `<DetalheCarta>`
 * como `secaoCompra`. A página não muda: ela só renderiza `<AbaFalta {...}/>`
 * quando a aba é "falta" e lê `secaoCompraDoDetalhe` daqui. O contrato está
 * documentado em `docs/design-v2/rules.md`, regra 27.
 */

import { ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

import type { GradeColecaoV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import type { PropsDetalheCarta } from "../../../_componentes/detalhe/detalhe-carta";
import type { ControleGradeVirtual } from "../../../_componentes/grade/grade-virtual";
import { BotaoLink } from "../../../_componentes/primitivos/botao";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import estilos from "./colecao.module.css";
import { ListaInteira } from "./lista-inteira";
import type { TamanhoInteiro } from "./vista-colecao";

/** O que a página entrega à aba. */
export interface ContextoAbaFalta {
  /** A grade inteira, como `GET /api/colecoes/:id/grade` a devolveu (Pokédex ou set; customizada não tem esta aba). */
  colecao: GradeColecaoV2DTO;
  /** As vagas vazias, na ordem da grade. */
  vazias: readonly VagaGradeV2DTO[];
  /** Muda a cada leitura nova da grade: o que a aba lê por conta própria (`GET .../falta`) relê junto. */
  versaoGrade: number;
  /** Abre o detalhe da vaga (com a transição e o retorno do foco da página). */
  abrirVaga: (vaga: VagaGradeV2DTO) => void;
  /** Relê a grade (depois de marcar ou desmarcar uma compra). */
  reler: () => void;
  /** A vaga aberta no detalhe e a do par ativo da transição. */
  abertaId: string | null;
  parAtivo: string | null;
  /** O tamanho das cartas da lista inteira (a preferência do aparelho). */
  tamanho: TamanhoInteiro;
  /** O controle da grade virtual: a página o usa para devolver o foco à vaga certa. */
  controle: Ref<ControleGradeVirtual>;
}

/** O ponto de extensão de compra do detalhe na vaga vazia (regra 24). `undefined` até o 1e. */
export const secaoCompraDoDetalhe: PropsDetalheCarta["secaoCompra"] = undefined;

export function AbaFalta({ colecao, vazias, abrirVaga, abertaId, parAtivo, tamanho, controle }: ContextoAbaFalta) {
  const t = useTranslations("v2Colecao.falta");
  return (
    <div className={estilos.abaFalta}>
      <AvisoEmLinha
        icone={<ShoppingCart aria-hidden />}
        titulo={t("emBreve")}
        acao={
          <BotaoLink href={`/v1/colecoes/${colecao.id}`} pequeno>
            {t("fazerNaV1")}
          </BotaoLink>
        }
      >
        {t("emBreveTexto")}
      </AvisoEmLinha>
      {vazias.length === 0 ? (
        <AvisoEmLinha tom="sucesso" titulo={t("nada")}>
          {t("nadaTexto")}
        </AvisoEmLinha>
      ) : (
        <ListaInteira
          vagas={vazias}
          tipo={colecao.tipo}
          tamanho={tamanho}
          rotulo={t("rotuloLista", { total: vazias.length })}
          abertaId={abertaId}
          parAtivo={parAtivo}
          aoAbrir={abrirVaga}
          controle={controle}
        />
      )}
    </div>
  );
}
