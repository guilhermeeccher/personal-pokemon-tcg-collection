import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { mapearEstadosDex } from "@/lib/dominio/dex-estado";
import { comTrofeusDoHome } from "@/lib/dominio/dex-trofeus-home";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { PainelTrofeus } from "./_componentes/painel-trofeus";
import { abasDeTrofeus } from "./_componentes/regras-trofeus";

/**
 * `/dex/trofeus` na v2 (pacote 5e-b): os troféus do HOME, calculados dos
 * registros (`comTrofeusDoHome`), e os de cada jogo da pessoa. As leituras
 * são as da página da v1, as mesmas funções, no servidor. `?jogo=` abre num
 * jogo, como na v1.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo", nunca uma lista vazia.
 */
export default async function PaginaTrofeus({ searchParams }: PageProps<"/dex/trofeus">) {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([
      listarJogosPossuidos(db),
      listarTrofeus(db),
      listarFormasDex(db),
      listarRegistrosDex(db),
      lerSecoesDex(db),
    ]);
  } catch (erro) {
    console.error("troféus da Dex: falha ao ler", erro);
    const t = await getTranslations("v2Dex");
    return (
      <AvisoEmLinha
        tom="perigo"
        papel="alert"
        titulo={t("erroCarregar")}
        acao={<TentarDeNovo rotulo={t("tentarDeNovo")} />}
      >
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  const [jogos, lista, formas, registros, secoes] = lido;
  const params = await searchParams;
  const trofeus = comTrofeusDoHome(lista, formas, mapearEstadosDex(registros), secoes);
  return (
    <PainelTrofeus
      jogos={abasDeTrofeus(jogos, trofeus)}
      trofeus={trofeus}
      jogoInicial={typeof params.jogo === "string" ? params.jogo : ""}
    />
  );
}
