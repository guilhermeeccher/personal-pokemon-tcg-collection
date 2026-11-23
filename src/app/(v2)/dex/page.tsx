import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../_componentes/primitivos/painel";

import { TentarDeNovo } from "./_componentes/tentar-de-novo";
import { VisaoGeralDex } from "./_visao-geral/visao-geral-dex";

/**
 * `/dex` — a visão geral da Living Dex na v2 (pacote 5a). As leituras são as
 * da página da v1, as mesmas funções, no servidor; a tela só desenha.
 *
 * A guarda do módulo vem antes de tudo, como nas pontes (`rules.md`, "Dex
 * shared code", A): desligado, 404 direto, sem tocar no banco.
 * `connection()` antes da flag: sem ele o build poderia pré-renderizar a
 * página com a flag do build (sempre desligada). Uma leitura que falha não
 * vira uma Dex vazia ("0 de 0"): vira erro na tela, com "Tentar de novo".
 */
export default async function PaginaVisaoGeralDex() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([
      listarFormasDex(db),
      lerSecoesDex(db),
      listarRegistrosDex(db),
      listarJogosPossuidos(db),
      listarTrofeus(db),
      listarPlanos(db),
    ]);
  } catch (erro) {
    console.error("visão geral da Dex: falha ao ler", erro);
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

  const [formas, secoes, registros, jogos, trofeus, planos] = lido;
  return (
    <VisaoGeralDex
      formas={formas}
      secoes={secoes}
      registros={registros}
      jogos={jogos}
      trofeus={trofeus}
      planos={planos.filter((p) => p.status === "ativo")}
    />
  );
}
