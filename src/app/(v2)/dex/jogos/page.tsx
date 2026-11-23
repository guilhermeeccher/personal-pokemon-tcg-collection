import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarJogosPossuidos } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { progressoTrofeus } from "@/lib/dominio/dex-trofeus";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { ListaJogos } from "./_componentes/lista-jogos";

/**
 * `/dex/jogos` — os jogos que o usuário tem, com o andamento dos troféus, na
 * v2 (pacote 5e-a). As leituras e a conta dos troféus são as da página da
 * v1, no servidor (`progressoTrofeus`), então os números são os mesmos.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. Uma leitura que falha vira erro
 * na tela, com "Tentar de novo", nunca uma lista vazia.
 */
export default async function PaginaJogosDex() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([listarJogosPossuidos(db), listarTrofeus(db)]);
  } catch (erro) {
    console.error("jogos da dex: falha ao ler", erro);
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

  const [jogos, trofeus] = lido;
  const obtidos = new Set(trofeus.filter((t) => t.obtido).map((t) => t.id));
  const progresso = Object.fromEntries(
    jogos.map((j) => {
      const p = progressoTrofeus(trofeus, j.jogoId, obtidos);
      return [j.jogoId, { obtidos: p.obtidos, total: p.total, platina: p.platina }];
    }),
  );
  return <ListaJogos jogos={jogos} trofeus={progresso} />;
}
