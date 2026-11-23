import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { CaixasHome } from "./_componentes/caixas-home";

/**
 * `/dex/caixas` — as caixas do HOME na v2 (pacote 5b). As leituras são as da
 * página da v1, no servidor; as caixas em si são calculadas no cliente com o
 * módulo de domínio (`dex-caixas.ts`), nunca guardadas.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo", nunca uma lista de caixas vazia.
 */
export default async function PaginaCaixas() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([listarFormasDex(db), lerSecoesDex(db), listarRegistrosDex(db), lerCaixasReservadas(db)]);
  } catch (erro) {
    console.error("caixas: falha ao ler", erro);
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

  const [formas, secoes, registros, caixasReservadas] = lido;
  return <CaixasHome formas={formas} secoes={secoes} registros={registros} caixasReservadas={caixasReservadas} />;
}
