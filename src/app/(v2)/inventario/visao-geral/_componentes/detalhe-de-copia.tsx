"use client";

/**
 * Abrir o `<DetalheCarta>` em **modo cópia** a partir de uma carta de uma
 * lista (as joias da visão geral, as repetidas). É o papel de "quem abre" que
 * a regra 25 de `docs/design-v2/rules.md` descreve:
 *
 * - a carta clicada ganha o nome de transição numa atualização **urgente**, e
 *   só então o detalhe abre dentro de `startTransition` (o React confirma a
 *   urgente primeiro, e o nome já está no DOM quando a vista "antes" é
 *   fotografada); só essa carta da lista leva nome;
 * - enquanto o detalhe está aberto, a carta sai da lista e fica o lugar dela
 *   (o nome só pode existir num elemento, e é o do palco que o leva);
 * - o nome fica na carta depois de fechar, para o detalhe voltar a ela;
 * - o `onFechar` do detalhe já roda dentro de `startTransition`.
 *
 * **Toda escrita do detalhe relê a tela** (`router.refresh`): editar uma
 * cópia, alocá-la, trocar a foto ou apagá-la muda o que a lista mostra
 * (repetidas que deixam de ser repetidas, o preço de uma joia, a foto). O
 * detalhe continua aberto na carta em que estava; ele lê a si mesmo.
 */

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useState } from "react";

import { DetalheCarta, type PreviaDaCarta } from "../../../_componentes/detalhe/detalhe-carta";
import { Carta } from "../../../_componentes/carta/carta";
import { TransicaoVista } from "../../../_componentes/movimento/transicao-vista";
import { nomeTransicaoCarta } from "../../../_componentes/movimento/nome-transicao";

import estilos from "./detalhe-de-copia.module.css";

export interface PedidoDetalhe {
  cartaId: string;
  copiaId: string;
  previa: PreviaDaCarta;
}

export function useDetalheDeCopia() {
  const router = useRouter();
  const [aberto, setAberto] = useState<PedidoDetalhe | null>(null);
  // A cópia cuja carta é o par ativo da transição: continua depois de fechar.
  const [alvo, setAlvo] = useState<string | null>(null);

  const abrir = useCallback((pedido: PedidoDetalhe) => {
    setAlvo(pedido.copiaId);
    startTransition(() => setAberto(pedido));
  }, []);
  const fechar = useCallback(() => setAberto(null), []);
  // Qualquer evento, "desatualizada" inclusive: a tela relê do servidor.
  const aoMudar = useCallback(() => router.refresh(), [router]);

  const detalhe = (
    <DetalheCarta
      abertura={
        aberto ? { modo: "copia", cartaId: aberto.cartaId, copiaId: aberto.copiaId, previa: aberto.previa } : null
      }
      onFechar={fechar}
      onMudou={aoMudar}
      chaveTransicao={alvo ? `copia:${alvo}` : undefined}
    />
  );

  return { abrir, detalhe, abertaCopiaId: aberto?.copiaId ?? null, alvoCopiaId: alvo };
}

/**
 * A carta da lista como botão que abre o detalhe. O rótulo acessível diz o
 * que ela é e o que o toque faz; a variante e a raridade da carta não são
 * informação só do brilho (regra 1 de `rules.md`): a lista as escreve ao
 * lado.
 *
 * `soPonteiro`: a carta é só um atalho para quem toca ou clica, e há um botão
 * de texto equivalente ao lado (a lista de repetidas). Sai da ordem do Tab e
 * do leitor de tela, para o mesmo comando não aparecer duas vezes.
 */
export function CartaQueAbre({
  copiaId,
  nome,
  imagemUrl,
  imagemOrigem,
  raridade,
  rotulo,
  aberta,
  noParAtivo,
  aoAbrir,
  soPonteiro = false,
  className,
}: {
  copiaId: string;
  nome: string;
  imagemUrl: string | null;
  imagemOrigem?: PreviaDaCarta["imagemOrigem"];
  raridade: string | null;
  rotulo: string;
  aberta: boolean;
  noParAtivo: boolean;
  aoAbrir: () => void;
  soPonteiro?: boolean;
  className?: string;
}) {
  const [comFoco, setComFoco] = useState(false);
  return (
    <button
      type="button"
      className={[estilos.carta, className].filter(Boolean).join(" ")}
      aria-label={soPonteiro ? undefined : rotulo}
      aria-hidden={soPonteiro || undefined}
      tabIndex={soPonteiro ? -1 : undefined}
      onClick={aoAbrir}
      onFocus={() => setComFoco(true)}
      onBlur={() => setComFoco(false)}
    >
      {aberta ? (
        <span className={estilos.lugar} aria-hidden />
      ) : (
        // Fora do par ativo, nada de transição: sem nome o React daria um nome
        // automático a cada carta e animaria todas (orçamento da regra 5).
        <TransicaoVista name={nomeTransicaoCarta(`copia:${copiaId}`, noParAtivo)} default={noParAtivo ? undefined : "none"}>
          <Carta
            imagemUrl={imagemUrl}
            origem={imagemOrigem ?? null}
            alt={nome}
            raridade={raridade}
            ativa={comFoco}
          />
        </TransicaoVista>
      )}
    </button>
  );
}
