"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import type { FontePreco } from "@/lib/dominio/fonte-preco";

import { Carta } from "../../../../_componentes/carta/carta";
import type { Formatos } from "../../../../_componentes/detalhe/formatos";
import { Botao } from "../../../../_componentes/primitivos/botao";
import { Modal } from "../../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../../_componentes/primitivos/painel";
import { LinhaPreco } from "../../_componentes/preco-compra";

import type { PlanoMelhor } from "./opcoes-compra";
import estilos from "./opcoes.module.css";
import { numeracao, tituloDaVaga } from "./vaga-opcoes";

/** Linhas por vez na conferência: uma Pokédex nacional chega a mil vagas, cada uma com foto. */
const LINHAS_POR_VEZ = 40;

/**
 * "Marcar a melhor de cada vaga" — o atalho da v1, agora explícito (decisão 2
 * do README da v2): antes de qualquer escrita, a janela mostra **o critério**
 * (a ordem e o teto que a tela está usando) e **a carta** que cada vaga
 * receberia, com o preço e a fonte, e diz quantas vagas ficam de fora e por
 * quê. Só o botão de confirmar envia, e ele é o clique do usuário (regra 5);
 * cancelar não envia nada.
 */
export function AtalhoOpcoes({
  plano,
  mudou,
  criterio,
  fonte,
  formatos,
  onFechar,
  onConfirmar,
}: {
  plano: PlanoMelhor;
  /** A leitura mudou desde a prévia anterior: esta é a nova, e a confirmação de antes não valeu. */
  mudou: boolean;
  criterio: string;
  fonte: FontePreco;
  formatos: Formatos;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  const t = useTranslations("v2OpcoesCompra.atalho");
  const [mostrar, setMostrar] = useState(LINHAS_POR_VEZ);
  const total = plano.itens.length;
  const fora = (Object.entries(plano.fora) as [keyof PlanoMelhor["fora"], number][]).filter(([, n]) => n > 0);

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={t("titulo")}
      descricao={fonte === "cardmarket" ? t("descricaoCardmarket") : t("descricaoLiga")}
      largura={620}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            {t("cancelar")}
          </Botao>
          <Botao variante="primario" disabled={total === 0} onClick={onConfirmar}>
            {t("confirmar", { total })}
          </Botao>
        </>
      }
    >
      <div className={estilos.atalho}>
        {mudou ? (
          <AvisoEmLinha tom="alerta" papel="status">
            {t("mudou")}
          </AvisoEmLinha>
        ) : null}
        <p className={estilos.texto}>{criterio}</p>
        {fora.length > 0 ? (
          <ul className={estilos.listaFora}>
            {fora.map(([motivo, n]) => (
              <li key={motivo}>{t(`fora.${motivo}`, { total: n })}</li>
            ))}
          </ul>
        ) : null}
        {total === 0 ? (
          <p className={estilos.texto}>{fonte === "cardmarket" ? t("vazioCardmarket") : t("vazio")}</p>
        ) : (
          <ol className={estilos.listaAtalho} aria-label={t("rotuloLista", { total })}>
            {plano.itens.slice(0, mostrar).map(({ vaga, opcao }) => (
              <li key={vaga.chave} className={estilos.linhaAtalho}>
                <span className={estilos.miniaturaFixa}>
                  {opcao.imagemUrl ? (
                    <Carta imagemUrl={opcao.imagemUrl} origem={opcao.imagemOrigem} alt="" raridade={opcao.raridade} />
                  ) : (
                    <span className={estilos.semFoto} aria-hidden />
                  )}
                </span>
                <span className={estilos.opcaoTexto}>
                  <span className={estilos.sutil}>{tituloDaVaga(vaga)}</span>
                  <span className={estilos.opcaoNome}>{opcao.nome}</span>
                  <span className={estilos.sutil}>{`${opcao.edicaoNome} (${numeracao(opcao)})`}</span>
                  {opcao.preco !== null ? (
                    <LinhaPreco
                      preco={{
                        fonte,
                        valor: opcao.preco,
                        em: null,
                        ...(fonte === "cardmarket" && opcao.cardmarket ? { cardmarket: opcao.cardmarket } : {}),
                      }}
                      formatos={formatos}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
        {total > mostrar ? (
          <Botao pequeno variante="fantasma" onClick={() => setMostrar((m) => m + LINHAS_POR_VEZ)}>
            {t("mostrarMais", { total: total - mostrar })}
          </Botao>
        ) : null}
      </div>
    </Modal>
  );
}
