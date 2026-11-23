"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { CopiaDoInventarioDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../_componentes/carta/carta";
import { nomeTransicaoCarta } from "../../_componentes/movimento/nome-transicao";
import { TransicaoVista } from "../../_componentes/movimento/transicao-vista";
import { Botao } from "../../_componentes/primitivos/botao";
import estilos from "./inventario.module.css";

/**
 * Uma cópia na lista. A mesma marcação em toda largura (uma árvore só): a
 * caixa de seleção, um botão que abre o detalhe — miniatura e texto juntos, a
 * área de toque inteira — e "Remover". A variante, o idioma físico e a
 * condição são texto, nunca só o brilho da carta (regra 1 de `rules.md`).
 *
 * Enquanto o detalhe desta cópia está aberto, a miniatura sai da lista e fica
 * o lugar dela: o nome de transição só pode existir num elemento, e é a carta
 * do palco que o leva. Fora do par ativo, nenhum nome (regra 25).
 */
export function LinhaCopia({
  copia: c,
  selecionada,
  aberta,
  noParAtivo,
  removendo,
  onAlternar,
  onAbrir,
  onRemover,
}: {
  copia: CopiaDoInventarioDTO;
  selecionada: boolean;
  aberta: boolean;
  noParAtivo: boolean;
  removendo: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
  onRemover: () => void;
}) {
  const t = useTranslations("v2Inventario");
  const tComp = useTranslations("componentes");
  const chave = `copia:${c.id}`;

  return (
    <li className={`${estilos.linha} v2-painel`} data-selecionada={selecionada || undefined}>
      <label className={estilos.caixaLinha}>
        <input
          type="checkbox"
          className={estilos.caixa}
          checked={selecionada}
          onChange={onAlternar}
          aria-label={t("selecionar", { carta: c.cartaNome, numero: c.cartaLocalId })}
        />
      </label>

      <button type="button" className={estilos.abrir} onClick={onAbrir} data-abrir-copia={c.id}>
        <span className={estilos.miniatura}>
          {aberta ? (
            <span className={estilos.lugarCarta} aria-hidden />
          ) : (
            <TransicaoVista name={nomeTransicaoCarta(chave, noParAtivo)} default={noParAtivo ? undefined : "none"}>
              <Carta
                imagemUrl={c.imagemUrl}
                origem={c.imagemOrigem}
                alt=""
                variante={c.variante}
                raridade={c.raridade}
                fallback={<span className={estilos.semImagem}>{t("semImagem")}</span>}
              />
            </TransicaoVista>
          )}
        </span>
        <span className={estilos.texto}>
          <span className={estilos.nome}>
            {c.cartaNome}
            {c.nomeEspecie ? <span className={estilos.especie}> ({c.nomeEspecie})</span> : null}{" "}
            <span className={`${estilos.numero} v2-num`}>#{c.cartaLocalId}</span>
          </span>
          <span className={estilos.set}>{c.setNome}</span>
          <span className={estilos.selos}>
            {/* Lote: só quando passa de uma unidade, o caso comum fica sem ruído. */}
            {c.quantidade > 1 ? (
              <span className={`${estilos.selo} ${estilos.seloLote}`}>{t("quantidade", { total: c.quantidade })}</span>
            ) : null}
            <span className={estilos.selo} data-variante={c.variante}>
              {tComp(`variante.${c.variante}`)}
            </span>
            <span className={estilos.selo}>{t(`idiomaCurto.${c.idioma}`)}</span>
            <span className={`${estilos.selo} v2-num`} data-condicao={c.condicao}>
              {c.condicao}
            </span>
            {c.gradedEmpresa ? (
              <span className={`${estilos.selo} v2-num`}>
                {c.gradedEmpresa} {c.gradedNota ?? ""}
              </span>
            ) : null}
          </span>
          {c.localizacao ? (
            <span className={estilos.onde}>{t("localizacao", { local: c.localizacao })}</span>
          ) : null}
          <span className={estilos.alocacao} data-livre={c.alocada ? undefined : ""}>
            {c.alocada
              ? t("alocadaEm", {
                  colecao: c.colecaoNome ?? "",
                  vaga: c.vagaChave ? rotuloChaveVaga(c.vagaChave) : "",
                })
              : t("livre")}
          </span>
        </span>
      </button>

      <Botao
        variante="fantasma"
        soIcone
        className={estilos.remover}
        aria-label={t("remover.rotulo", { carta: c.cartaNome, numero: c.cartaLocalId })}
        icone={<Trash2 aria-hidden size={18} />}
        carregando={removendo}
        onClick={onRemover}
      />
    </li>
  );
}
