import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { RecebidosHome } from "./_componentes/recebidos-home";

/**
 * `/dex/recebidos` — o que chegou ao HOME e ainda não foi guardado, por caixa
 * de destino (`dex-recebidos.ts`), na v2 (pacote 5b). As leituras são as da
 * página da v1, no servidor.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo": nunca um "nada a guardar" que não é verdade.
 */
export default async function PaginaRecebidos() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([listarFormasDex(db), lerSecoesDex(db), listarRegistrosDex(db), lerCaixasReservadas(db)]);
  } catch (erro) {
    console.error("recebidos: falha ao ler", erro);
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
  return <RecebidosHome formas={formas} secoes={secoes} registros={registros} caixasReservadas={caixasReservadas} />;
}
