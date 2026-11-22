"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { Botao } from "./botao";
import { Modal } from "./modal";
import type { ResolvedorFoco } from "./use-camada";

export interface OpcoesConfirmacao {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** O verbo da ação ("Excluir coleção"), nunca "OK". */
  rotuloConfirmar: string;
  rotuloCancelar?: string;
  /** Ação destrutiva ou irreversível: botão vermelho. */
  perigoso?: boolean;
  devolverFocoPara?: ResolvedorFoco;
}

/**
 * Diálogo de confirmação de vidro: o substituto de `window.confirm` na v2
 * (regra 14 de `docs/design-v2/rules.md`). Uma ação destrutiva ou
 * irreversível pergunta por ele, e **cancelar não envia nada**.
 *
 * - O foco abre no "Cancelar": Enter por reflexo não destrói nada.
 * - Esc e "Cancelar" cancelam; não há X, e tocar fora não faz nada (uma
 *   confirmação não fecha por um toque de raspão).
 * - `ocupado`: enquanto a ação roda, os dois botões ficam desligados, o de
 *   confirmar mostra o giro e o Esc não fecha — a ação já saiu.
 *
 * Para trocar um `window.confirm` com o mínimo de mudança, use
 * `useConfirmacao()`, que devolve uma promessa de booleano.
 */
export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloCancelar,
  perigoso = false,
  ocupado = false,
  aoConfirmar,
  aoCancelar,
  devolverFocoPara,
}: OpcoesConfirmacao & {
  aberto: boolean;
  ocupado?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const t = useTranslations("v2Primitivos");
  const cancelar = useRef<HTMLButtonElement>(null);
  const fechar = ocupado ? () => {} : aoCancelar;

  return (
    <Modal
      aberto={aberto}
      onFechar={fechar}
      titulo={titulo}
      descricao={descricao}
      papel="alertdialog"
      largura={440}
      focoInicial={cancelar}
      fecharPeloVeu={false}
      semBotaoFechar
      devolverFocoPara={devolverFocoPara}
      rodape={
        <>
          <Botao ref={cancelar} variante="fantasma" disabled={ocupado} onClick={aoCancelar}>
            {rotuloCancelar ?? t("cancelar")}
          </Botao>
          <Botao variante={perigoso ? "perigo" : "primario"} carregando={ocupado} onClick={aoConfirmar}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    />
  );
}

/**
 * `const { confirmar, dialogo } = useConfirmacao();` — renderize `dialogo`
 * e troque `if (!window.confirm(texto)) return;` por
 * `if (!(await confirmar({ titulo, rotuloConfirmar }))) return;`.
 *
 * Uma confirmação por vez: pedir outra com uma aberta responde `false` à
 * anterior, que nunca fica pendurada.
 */
export function useConfirmacao(): {
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>;
  dialogo: ReactNode;
} {
  const [pedido, setPedido] = useState<OpcoesConfirmacao | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const responder = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  }, []);

  const confirmar = useCallback((opcoes: OpcoesConfirmacao) => {
    resolver.current?.(false);
    setPedido(opcoes);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dialogo = (
    <DialogoConfirmacao
      aberto={pedido !== null}
      titulo={pedido?.titulo ?? ""}
      descricao={pedido?.descricao}
      rotuloConfirmar={pedido?.rotuloConfirmar ?? ""}
      rotuloCancelar={pedido?.rotuloCancelar}
      perigoso={pedido?.perigoso}
      devolverFocoPara={pedido?.devolverFocoPara}
      aoConfirmar={() => responder(true)}
      aoCancelar={() => responder(false)}
    />
  );

  return { confirmar, dialogo };
}
