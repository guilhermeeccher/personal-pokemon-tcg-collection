"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import type { CriterioDaPropostaV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { useFormatos } from "../../../_componentes/detalhe/formatos";
import { Botao } from "../../../_componentes/primitivos/botao";
import { Modal } from "../../../_componentes/primitivos/modal";
import type { ResolvedorFoco } from "../../../_componentes/primitivos/use-camada";

import type { PlanoDoAtalho } from "./compra-falta";
import estilos from "./falta.module.css";
import { LinhaPreco, textoDoCriterio } from "./preco-compra";

/** Linhas por vez na conferência: uma Pokédex nacional chega a mil vagas, cada uma com foto. */
const LINHAS_POR_VEZ = 40;

/**
 * "Marcar a melhor de cada vaga" — o atalho explícito da decisão 2. Antes de
 * qualquer escrita, a janela mostra **o critério** (a ordem, o teto e de onde
 * eles vêm) e **a carta** que cada vaga receberia, com o preço e a fonte, e
 * diz quantas vagas ficam de fora e por quê. Só o botão de confirmar envia, e
 * ele é o clique do usuário (regra 5); cancelar não envia nada.
 *
 * O plano é o que a última leitura propôs (`planoDoAtalho`): só vaga sem
 * escolha, só opção com preço.
 */
export function AtalhoMelhor({
  aberto,
  plano,
  criterio,
  vagasPorId,
  onFechar,
  onConfirmar,
  devolverFocoPara,
}: {
  aberto: boolean;
  plano: PlanoDoAtalho;
  criterio: CriterioDaPropostaV2DTO | null;
  vagasPorId: ReadonlyMap<string, VagaGradeV2DTO>;
  onFechar: () => void;
  onConfirmar: () => void;
  devolverFocoPara?: ResolvedorFoco;
}) {
  const t = useTranslations("v2Falta.atalho");
  const tCriterio = useTranslations("v2Falta.criterio");
  const formatos = useFormatos();
  const [mostrar, setMostrar] = useState(LINHAS_POR_VEZ);
  const total = plano.itens.length;
  const fora = (Object.entries(plano.fora) as [keyof PlanoDoAtalho["fora"], number][]).filter(([, n]) => n > 0);

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={t("titulo")}
      descricao={t("descricao")}
      largura={620}
      devolverFocoPara={devolverFocoPara}
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
        {criterio ? <p className={estilos.criterio}>{textoDoCriterio(tCriterio, criterio, formatos)}</p> : null}
        {fora.length > 0 ? (
          <ul className={estilos.listaFora}>
            {fora.map(([motivo, n]) => (
              <li key={motivo}>{t(`fora.${motivo}`, { total: n })}</li>
            ))}
          </ul>
        ) : null}
        {total === 0 ? (
          <p className={estilos.sutil}>{t("vazio")}</p>
        ) : (
          <ol className={estilos.listaAtalho} aria-label={t("rotuloLista", { total })}>
            {plano.itens.slice(0, mostrar).map(({ vagaId, opcao }) => {
              const vaga = vagasPorId.get(vagaId);
              const alvo = vaga ? (vaga.especie ?? vaga.cartaNome ?? null) : null;
              return (
                <li key={vagaId} className={estilos.linhaAtalho}>
                  <span className={estilos.miniatura}>
                    <Carta imagemUrl={opcao.imagemUrl ?? null} origem={opcao.imagemOrigem ?? null} alt="" raridade={opcao.raridade} />
                  </span>
                  <span className={estilos.opcaoTexto}>
                    <span className={estilos.sutil}>
                      {t("vaga", { numero: vaga?.numero ?? "—" })}
                      {alvo ? ` · ${alvo}` : ""}
                    </span>
                    <span className={estilos.nomeOpcao}>{opcao.nomeExibicao ?? opcao.nome}</span>
                    <span className={estilos.sutil}>
                      {[opcao.edicaoNome, opcao.total ? `${opcao.numero}/${opcao.total}` : opcao.numero, opcao.raridade].filter(Boolean).join(" · ")}
                    </span>
                    <LinhaPreco preco={opcao.preco} formatos={formatos} />
                  </span>
                </li>
              );
            })}
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
