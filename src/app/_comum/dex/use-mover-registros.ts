"use client";

/**
 * O fluxo de mover registros da Living Dex, sem pele: a v1
 * (`(v1)/v1/dex/_componentes/use-transferencia.tsx`) e a v2
 * (`(v2)/dex/_componentes/use-transferencia.tsx`) desenham cada uma a sua
 * janela de confirmação por cima deste estado.
 *
 * - `mover(ids, local)` envia sem confirmar. Um 409 `dexConfirmarSemVolta`
 *   não é erro: vira `pendente`, com a frase da rota (que nomeia o jogo).
 * - `confirmar()` reenvia o mesmo pedido com `confirmarSemVolta: true`. É o
 *   único caminho até esse corpo, e só o clique da pessoa o chama.
 * - `cancelar()` descarta o pendente sem enviar nada.
 *
 * A sequência mora em `criarFluxoMover` (`mover-registros.ts`, testada passo a
 * passo); este hook só liga o `fetch`, o estado do React e as frases.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";

import { criarFluxoMover, type EstadoFluxoMover, type PedidoMover, type ResultadoFluxoMover } from "./mover-registros";

export interface PendenteSemVolta extends PedidoMover {
  /** A frase da recusa, já no idioma da interface ("O Pokémon sai de GO e não volta mais…"). */
  frase: string;
}

export interface MoverRegistros {
  mover: (ids: readonly string[], local: string) => Promise<void>;
  confirmar: () => Promise<void>;
  cancelar: () => void;
  pendente: PendenteSemVolta | null;
  ocupado: boolean;
  erro: string | null;
}

async function postMover(corpo: string) {
  const r = await fetch("/api/dex/registros/mover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as unknown };
}

/**
 * `aoConcluir(movidos)` roda depois de um movimento aceito (a tela relê o que
 * mudou). `erroPadrao` é a frase da tela quando a resposta não traz recusa
 * reconhecível (rede caída, 5xx). `aoRecusar(status)` roda depois de uma
 * recusa, com a frase já em `erro`: num 404 ou 409 a tela está velha (outra
 * aba moveu ou apagou o registro) e quem usa decide reler.
 */
export function useMoverRegistros(
  aoConcluir: (movidos: number) => void,
  erroPadrao: string,
  aoRecusar?: (status: number) => void,
): MoverRegistros {
  const tr = useTranslations("recusas");
  const [estado, setEstado] = useState<EstadoFluxoMover>({ pendente: null, ocupado: false, falha: null });
  // Um fluxo por montagem: ele guarda o pendente entre um clique e outro.
  const [fluxo] = useState(() => criarFluxoMover({ post: postMover, aoMudar: setEstado }));
  // Os retornos são os desta renderização: o fluxo só diz como terminou.
  const tratar = (r: ResultadoFluxoMover) => {
    if (r.tipo === "ok") aoConcluir(r.movidos);
    else if (r.tipo === "recusa") aoRecusar?.(r.status);
  };

  const { pendente, ocupado, falha } = estado;
  return {
    mover: async (ids, local) => tratar(await fluxo.mover(ids, local)),
    confirmar: async () => tratar(await fluxo.confirmar()),
    cancelar: fluxo.cancelar,
    pendente: pendente && { ids: pendente.ids, local: pendente.local, frase: textoDaRecusa(tr, pendente.corpo, erroPadrao) },
    ocupado,
    erro: falha === null ? null : falha === "rede" ? erroPadrao : textoDaRecusa(tr, falha.corpo, erroPadrao),
  };
}
