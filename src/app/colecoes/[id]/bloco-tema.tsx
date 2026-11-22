"use client";

/**
 * O bloco de uma coleção temática na página dela: o tema e, quando há,
 * "N cartas novas cabem neste tema" — o incentivo para voltar a ela. Só lista:
 * o botão abre `ModalCartasDoTema`, e quem aloca é o clique de confirmar lá
 * dentro (regra 5). Regras em `lib/dominio/cartas-do-tema.ts`; aqui só a tela.
 *
 * - **A contagem é um sinal acessório**: se a leitura falha, o bloco mostra só
 *   o tema, e a coleção segue utilizável (como o distintivo de melhoria).
 * - **A contagem acompanha a página**: ela é relida quando as cópias alocadas
 *   da coleção mudam (`alocadas`), o que cobre a alocação e a desalocação
 *   avulsas feitas ali mesmo, e não só as do lote desta janela.
 * - Cada leitura leva um número de sequência, e a resposta de uma leitura
 *   superada é descartada. Depois de alocar, a contagem é lida de novo.
 * - A coleção temática não tem denominador: o progresso é "N cartas", como
 *   toda customizada.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import type { TemaColecao } from "@/lib/dominio/tema-colecao";
import type { CartasDoTemaDTO } from "@/lib/dominio/tipos-cliente";

import { ModalCartasDoTema } from "../modal-cartas-do-tema";
import { useRotuloTema } from "../rotulo-tema";

export function BlocoTema({
  colecaoId,
  nomeColecao,
  tema,
  temaRotulo,
  alocadas,
  onAlocadas,
}: {
  colecaoId: string;
  nomeColecao: string;
  tema: TemaColecao;
  /** O nome da espécie, num tema de espécie (`ColecaoComVagasDTO.temaRotulo`). */
  temaRotulo?: string;
  /**
   * As cópias alocadas da coleção como a página as tem (ids, em ordem): muda
   * quando uma cópia entra ou sai por qualquer caminho, e a contagem é relida.
   */
  alocadas: string;
  /** Depois de alocar: a página relê a coleção e mostra a mensagem. */
  onAlocadas: (total: number) => void;
}) {
  const t = useTranslations("temaColecao.bloco");
  const { rotuloDoTema } = useRotuloTema();
  const [cartasNovas, setCartasNovas] = useState<number | null>(null);
  const [aberta, setAberta] = useState(false);
  const sequencia = useRef(0);

  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return fetch(`/api/colecoes/${colecaoId}/cartas-do-tema`)
      .then(async (r) => (r.ok ? ((await r.json()) as Partial<CartasDoTemaDTO>) : null))
      .then((d) => {
        if (minha !== sequencia.current) return;
        setCartasNovas(typeof d?.cartasNovas === "number" ? d.cartasNovas : null);
      })
      .catch(() => {
        if (minha === sequencia.current) setCartasNovas(null);
      });
  }, [colecaoId]);

  useEffect(() => {
    void carregar();
  }, [carregar, alocadas]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {t("tema", { tipo: t(`tipos.${tema.tipo}`), tema: rotuloDoTema(tema.tipo, tema.valor, temaRotulo) })}
      </p>
      {cartasNovas !== null && cartasNovas > 0 && (
        <Alerta tom="sucesso" className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("cartasNovas", { total: cartasNovas })}</span>
          <Botao tamanho="sm" onClick={() => setAberta(true)}>
            {t("ver")}
          </Botao>
        </Alerta>
      )}
      {aberta && (
        <ModalCartasDoTema
          colecaoId={colecaoId}
          nomeColecao={nomeColecao}
          onFechar={() => {
            setAberta(false);
            // Fechar sem alocar também relê: uma cópia que entrou ou saiu do inventário muda a contagem.
            void carregar();
          }}
          onAlocadas={(total) => {
            // Uma leitura só: a página relê a coleção, as cópias alocadas
            // mudam e o efeito acima relê a contagem.
            setAberta(false);
            onAlocadas(total);
          }}
        />
      )}
    </div>
  );
}
