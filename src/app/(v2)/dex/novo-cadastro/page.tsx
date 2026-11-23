import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { NovoCadastro } from "./_componentes/novo-cadastro";

/**
 * `/dex/novo-cadastro` — o Novo cadastro na v2 (pacote 5d): escolher na
 * grade das caixas o que está indo ao HOME e dizer de que jogo sai
 * (`POST /api/dex/registros/enviar`). Lê o que a página da v1 lê, com as
 * mesmas funções: o que as Caixas leem, mais os jogos ativos e os
 * checkpoints pendentes, que dão as marcas do lote.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo", nunca uma grade vazia.
 */
export default async function PaginaNovoCadastro() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([
      listarFormasDex(db),
      lerSecoesDex(db),
      listarRegistrosDex(db),
      lerCaixasReservadas(db),
      listarJogosPossuidos(db),
      listarTrofeus(db),
    ]);
  } catch (erro) {
    console.error("novo cadastro: falha ao ler", erro);
    const t = await getTranslations("v2Dex");
    return (
      <AvisoEmLinha tom="perigo" papel="alert" titulo={t("erroCarregar")} acao={<TentarDeNovo rotulo={t("tentarDeNovo")} />}>
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  const [formas, secoes, registros, caixasReservadas, jogos, trofeus] = lido;
  return (
    <NovoCadastro
      formas={formas}
      secoes={secoes}
      registros={registros}
      caixasReservadas={caixasReservadas}
      // Só jogo ativo é saída: jogo parado não manda nem recebe (a rota recusa).
      jogos={jogos.filter((j) => j.ativo)}
      checkpoints={trofeus.filter((t) => t.tipo === "checkpoint" && !t.obtido)}
    />
  );
}
