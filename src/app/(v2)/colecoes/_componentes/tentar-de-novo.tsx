"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Botao } from "../../_componentes/primitivos/botao";

/**
 * "Tentar de novo" da leitura que falhou: a lista é lida no servidor, então
 * tentar de novo é renderizar a página outra vez (`router.refresh`). O botão
 * fica ocupado até a nova renderização chegar, para um segundo clique não
 * empilhar leituras.
 */
export function TentarDeNovo() {
  const t = useTranslations("v2Colecoes");
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Botao pequeno carregando={pendente} onClick={() => iniciar(() => router.refresh())}>
      {t("tentarDeNovo")}
    </Botao>
  );
}
