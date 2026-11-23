"use client";

import { useTranslations } from "next-intl";

import type { CartaEncontradaDTO } from "@/lib/dominio/tipos-cliente";

import { Carta } from "../../../_componentes/carta/carta";
import { Modal } from "../../../_componentes/primitivos/modal";

import estilos from "./cadastro-busca.module.css";

/**
 * O zoom de um resultado (CBUS-06): a carta do pacote 0b no modo `palco`, na
 * qualidade alta, numa janela da pilha de camadas (Esc, foco e trava de
 * rolagem vêm dela). Não é o detalhe de carta do pacote 1b: aquele lê uma
 * **cópia** ou uma vaga, e um resultado de busca ainda não é nenhuma das duas.
 *
 * A alta carrega uma de cada vez, por construção: só existe uma janela aberta.
 * O foco volta à miniatura que abriu a janela, passada por quem a abriu: no
 * Safari um toque não foca o botão, e o abridor que a pilha guarda seria outro.
 */
export function AmpliarCarta({
  carta,
  onFechar,
  devolverFocoPara,
}: {
  carta: CartaEncontradaDTO | null;
  onFechar: () => void;
  /** O botão da miniatura que abriu a janela. */
  devolverFocoPara: () => HTMLElement | null;
}) {
  const t = useTranslations("v2CadastroBusca");
  return (
    <Modal
      aberto={carta !== null}
      onFechar={onFechar}
      titulo={carta?.nome ?? ""}
      descricao={carta ? t("ampliarDescricao", { set: carta.setNome, numero: carta.localId }) : undefined}
      largura={420}
      devolverFocoPara={devolverFocoPara}
    >
      {carta && (
        <div className={estilos.zoom}>
          <Carta
            modo="palco"
            qualidade="high"
            imagemUrl={carta.imagemUrl}
            origem={carta.imagemOrigem}
            alt={carta.nome}
            raridade={carta.raridade}
            carregamento="eager"
            fallback={<span className={estilos.semImagem}>{t("semImagem")}</span>}
          />
        </div>
      )}
    </Modal>
  );
}
