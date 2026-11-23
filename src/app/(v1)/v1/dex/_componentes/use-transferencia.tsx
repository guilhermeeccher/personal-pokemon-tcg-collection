"use client";

/**
 * Mover registros da Living Dex, com a confirmação de transferência sem
 * volta. Usado pelo inventário e pelo painel "Levar ao HOME".
 *
 * A rota responde 409 com `dexConfirmarSemVolta` quando algum registro sai
 * de um jogo só de envio; aqui a frase vira um modal, e só o clique reenvia
 * com `confirmarSemVolta`. A confirmação é sempre do usuário.
 *
 * O pedido e a leitura da resposta são os de `_comum/dex/use-mover-registros.ts`,
 * os mesmos da v2; este arquivo é só a janela da v1.
 */

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Modal } from "@/app/_componentes/modal";
import { useMoverRegistros } from "@/app/_comum/dex/use-mover-registros";

export function useTransferencia(aoConcluir: () => void): {
  mover: (ids: string[], local: string) => Promise<void>;
  ocupado: boolean;
  erro: string | null;
  modal: ReactNode;
} {
  const t = useTranslations("dex");
  const tituloId = useId();
  const { mover, confirmar, cancelar, pendente, ocupado, erro } = useMoverRegistros(aoConcluir, t("oportunidades.erro"));

  const modal = pendente ? (
    // O Esc cancela (fecha sem transferir): a confirmação só acontece pelo clique em "Transferir".
    <Modal
      rotuloId={tituloId}
      onFechar={cancelar}
      rodape={
        <div className="flex justify-end gap-2">
          <Botao onClick={cancelar}>{t("transferencia.cancelar")}</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={confirmar}>
            {t("transferencia.confirmar")}
          </Botao>
        </div>
      }
    >
      <h3 id={tituloId} className="text-base font-bold text-strong">
        {t("transferencia.titulo")}
      </h3>
      <p>{pendente.frase}</p>
    </Modal>
  ) : null;

  return { mover, ocupado, erro, modal };
}
