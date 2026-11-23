"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Botao } from "../../_componentes/primitivos/botao";

/**
 * "Tentar de novo" de uma tela da Dex lida no servidor: renderiza a página
 * outra vez (`router.refresh`), com o botão ocupado até a nova renderização
 * chegar, para um segundo clique não empilhar leituras.
 */
export function TentarDeNovo({ rotulo }: { rotulo: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Botao pequeno carregando={pendente} onClick={() => iniciar(() => router.refresh())}>
      {rotulo}
    </Botao>
  );
}
