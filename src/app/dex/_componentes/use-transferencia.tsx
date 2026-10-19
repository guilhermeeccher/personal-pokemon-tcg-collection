"use client";

/**
 * Mover registros da Living Dex, com a confirmação de transferência sem
 * volta. Usado pelo inventário e pelo painel "Levar ao HOME".
 *
 * A rota responde 409 com `dexConfirmarSemVolta` quando algum registro sai
 * de um jogo só de envio; aqui a frase vira um modal, e só o clique reenvia
 * com `confirmarSemVolta`. A confirmação é sempre do usuário.
 */

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";

interface Pendente {
  ids: string[];
  local: string;
  frase: string;
}

export function useTransferencia(aoConcluir: () => void): {
  mover: (ids: string[], local: string) => Promise<void>;
  ocupado: boolean;
  erro: string | null;
  modal: ReactNode;
} {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tituloId = useId();

  async function enviar(ids: string[], local: string, confirmarSemVolta: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/dex/registros/mover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, local, confirmarSemVolta }),
      });
      const corpo = await r.json().catch(() => null);
      if (r.status === 409 && corpo?.recusa?.chave === "dexConfirmarSemVolta") {
        setPendente({ ids, local, frase: textoDaRecusa(tr, corpo, t("oportunidades.erro")) });
        return;
      }
      setPendente(null);
      if (!r.ok) {
        setErro(textoDaRecusa(tr, corpo, t("oportunidades.erro")));
        return;
      }
      aoConcluir();
    } catch {
      setErro(t("oportunidades.erro"));
    } finally {
      setOcupado(false);
    }
  }

  const modal = pendente ? (
    // O Esc cancela (fecha sem transferir): a confirmação só acontece pelo clique em "Transferir".
    <Modal
      rotuloId={tituloId}
      onFechar={() => setPendente(null)}
      rodape={
        <div className="flex justify-end gap-2">
          <Botao onClick={() => setPendente(null)}>{t("transferencia.cancelar")}</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={() => enviar(pendente.ids, pendente.local, true)}>
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

  return { mover: (ids, local) => enviar(ids, local, false), ocupado, erro, modal };
}
