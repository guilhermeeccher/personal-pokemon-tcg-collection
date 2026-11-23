"use client";

/**
 * Abrir o `<DetalheCarta>` em **modo cópia** a partir de uma linha da tabela de
 * preços — o papel de "quem abre" da regra 25 de `docs/design-v2/rules.md`:
 * a carta clicada ganha o nome de transição numa atualização **urgente**, e só
 * então o detalhe abre dentro de `startTransition`; só essa carta leva nome e
 * ele fica nela depois de fechar, para o detalhe voltar a ela.
 *
 * É a mesma mecânica do gancho das joias e das repetidas (pacote 2c), e não
 * aquele gancho, por uma diferença: lá toda escrita do detalhe relê a página
 * do servidor (`router.refresh`), e aqui a página não tem nada a reler no
 * servidor — o que muda é a leitura `GET /api/inventario/precos` da própria
 * tela e a cópia que cada carta abre. Quem usa passa o `aoMudar`.
 *
 * **O foco volta à carta que abriu**, e a lista pode ter mudado enquanto o detalhe
 * esteve aberto: numa rodada viva, preços novos reordenam a tabela, e a carta
 * pode ter saído da página. Então o foco volta ao botão da carta se ela ainda
 * está na página e, se não está, à própria lista (`data-lista-precos`), onde a
 * pessoa estava — e não ao topo da tela.
 *
 * Qualquer evento do detalhe chama `aoMudar`, inclusive "desatualizada": editar
 * ou apagar a última cópia de uma carta não apaga o preço guardado dela (uma
 * linha de preço nunca é apagada), mas muda a cópia que a carta abre.
 */

import { startTransition, useCallback, useState } from "react";

import { DetalheCarta, type PreviaDaCarta } from "../../../_componentes/detalhe/detalhe-carta";
import type { ResolvedorFoco } from "../../../_componentes/primitivos/use-camada";

export interface PedidoDetalhe {
  cartaId: string;
  copiaId: string;
  previa: PreviaDaCarta;
}

export function useDetalheDaCarta(aoMudar: () => void) {
  const [aberto, setAberto] = useState<PedidoDetalhe | null>(null);
  // A **carta** é o par ativo da transição, e continua depois de fechar: depois
  // de uma escrita a cópia representante pode ser outra, e a volta não pode
  // perder o par.
  const [alvo, setAlvo] = useState<string | null>(null);

  const devolverFocoPara = useCallback<ResolvedorFoco>(() => {
    const linha = alvo
      ? [...document.querySelectorAll<HTMLElement>("[data-carta-id]")].find((e) => e.dataset.cartaId === alvo)
      : undefined;
    return linha?.querySelector<HTMLElement>("[data-abre]") ?? document.querySelector<HTMLElement>("[data-lista-precos]");
  }, [alvo]);

  const abrir = useCallback((pedido: PedidoDetalhe) => {
    setAlvo(pedido.cartaId);
    startTransition(() => setAberto(pedido));
  }, []);
  const fechar = useCallback(() => setAberto(null), []);

  const detalhe = (
    <DetalheCarta
      abertura={
        aberto ? { modo: "copia", cartaId: aberto.cartaId, copiaId: aberto.copiaId, previa: aberto.previa } : null
      }
      onFechar={fechar}
      onMudou={aoMudar}
      chaveTransicao={alvo ? `carta:${alvo}` : undefined}
      devolverFocoPara={devolverFocoPara}
    />
  );

  return { abrir, detalhe, abertaCartaId: aberto?.cartaId ?? null, alvoCartaId: alvo };
}
