"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Botao } from "../../../_componentes/primitivos/botao";

/**
 * "Tentar de novo" de uma tela lida no servidor: tentar de novo é renderizar a
 * página outra vez (`router.refresh`). O botão fica ocupado até a nova
 * renderização chegar, para um segundo clique não empilhar leituras. O rótulo
 * vem de quem usa (a visão geral e as repetidas têm cada uma o seu texto).
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
