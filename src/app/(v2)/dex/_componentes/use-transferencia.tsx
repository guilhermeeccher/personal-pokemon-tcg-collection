"use client";

/**
 * Mover registros da Living Dex na v2, com a confirmação de saída sem volta.
 * Peça compartilhada da Dex (dono: pacote 5a; usam o "Levar ao HOME" da
 * Pokédex e o inventário da Dex, 5e — `docs/design-v2/rules.md`, "Dex shared
 * code").
 *
 * O pedido e a leitura da resposta são os de
 * `_comum/dex/use-mover-registros.ts`, os mesmos da v1; aqui só entra a pele:
 * o 409 `dexConfirmarSemVolta` vira o diálogo de confirmação da v2, com a
 * frase da rota (que nomeia o jogo). **A confirmação nunca é automática**:
 * só "Transferir" reenvia com `confirmarSemVolta: true`; "Cancelar" e Esc
 * fecham sem enviar nada (AGENTS.md, "Optional module: Living Dex").
 *
 * ```tsx
 * const { mover, ocupado, erro, dialogo } = useTransferencia(() => router.refresh());
 * <Botao disabled={ocupado} onClick={() => mover(ids, LOCAL_HOME)}>…</Botao>
 * {erro && <AvisoEmLinha tom="perigo" papel="alert">{erro}</AvisoEmLinha>}
 * {dialogo}
 * ```
 *
 * `erro` é a frase da última recusa (já traduzida por `recusa.ts`), ou nulo.
 * Enquanto o diálogo está aberto, uma falha ao confirmar aparece dentro dele,
 * onde a pessoa está olhando, e o diálogo fica para tentar de novo ou cancelar.
 */

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useMoverRegistros } from "@/app/_comum/dex/use-mover-registros";

import { DialogoConfirmacao } from "../../_componentes/primitivos/dialogo-confirmacao";
import type { ResolvedorFoco } from "../../_componentes/primitivos/use-camada";

import estilos from "./dex.module.css";

export function useTransferencia(
  aoConcluir: (movidos: number) => void,
  opcoes?: { devolverFocoPara?: ResolvedorFoco },
): {
  mover: (ids: readonly string[], local: string) => Promise<void>;
  ocupado: boolean;
  erro: string | null;
  dialogo: ReactNode;
} {
  const t = useTranslations("v2Dex.transferencia");
  const { mover, confirmar, cancelar, pendente, ocupado, erro } = useMoverRegistros(aoConcluir, t("erro"));

  const dialogo = (
    <DialogoConfirmacao
      aberto={pendente !== null}
      titulo={t("titulo")}
      descricao={
        pendente && (
          <>
            {pendente.frase}
            {erro && (
              <span className={estilos.erroNoDialogo} role="alert">
                {erro}
              </span>
            )}
          </>
        )
      }
      rotuloConfirmar={t("confirmar")}
      perigoso
      ocupado={ocupado}
      aoConfirmar={() => void confirmar()}
      aoCancelar={cancelar}
      devolverFocoPara={opcoes?.devolverFocoPara}
    />
  );

  // Com o diálogo aberto, o erro mora nele; fora, quem usa o mostra.
  return { mover, ocupado, erro: pendente ? null : erro, dialogo };
}
