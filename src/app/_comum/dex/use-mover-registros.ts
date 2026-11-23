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
 * Um pedido por vez: enquanto `ocupado`, `mover` e `confirmar` não fazem
 * nada (dois cliques rápidos em "Enviar" não mandam dois lotes).
 */

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";

import { corpoDoMover, lerRespostaMover, type PedidoMover } from "./mover-registros";

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
  const [pendente, setPendente] = useState<PendenteSemVolta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O "ocupado" de verdade, sem esperar o render: o segundo clique do mesmo
  // quadro já o encontra ligado.
  const emVoo = useRef(false);

  const enviar = useCallback(
    async (pedido: PedidoMover, confirmado: boolean) => {
      if (emVoo.current) return;
      emVoo.current = true;
      setOcupado(true);
      setErro(null);
      try {
        const r = await fetch("/api/dex/registros/mover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: corpoDoMover(pedido, confirmado),
        });
        const corpo: unknown = await r.json().catch(() => null);
        const resposta = lerRespostaMover(r.status, corpo, confirmado);
        if (resposta.tipo === "confirmar") {
          setPendente({ ids: pedido.ids, local: pedido.local, frase: textoDaRecusa(tr, resposta.corpo, erroPadrao) });
          return;
        }
        setPendente(null);
        if (resposta.tipo === "recusa") {
          setErro(textoDaRecusa(tr, resposta.corpo, erroPadrao));
          aoRecusar?.(r.status);
          return;
        }
        aoConcluir(resposta.movidos);
      } catch {
        // A rede caiu: o pendente fica (a janela continua aberta para tentar
        // de novo ou cancelar), como sempre foi na v1.
        setErro(erroPadrao);
      } finally {
        emVoo.current = false;
        setOcupado(false);
      }
    },
    [tr, erroPadrao, aoConcluir, aoRecusar],
  );

  const mover = useCallback((ids: readonly string[], local: string) => enviar({ ids, local }, false), [enviar]);
  const confirmar = useCallback(async () => {
    if (pendente) await enviar(pendente, true);
  }, [enviar, pendente]);
  const cancelar = useCallback(() => setPendente(null), []);

  return { mover, confirmar, cancelar, pendente, ocupado, erro };
}
