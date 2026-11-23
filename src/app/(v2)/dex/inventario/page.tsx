import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { InventarioDex } from "./_componentes/inventario-dex";

/**
 * `/dex/inventario` — os Pokémon cadastrados, agrupados, na v2 (pacote
 * 5e-a). As leituras são as da página da v1, no servidor.
 *
 * A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared code", A):
 * desligado, 404 direto, sem tocar no banco. `connection()` antes da flag,
 * para o build não congelar o valor dela. Uma leitura que falha vira erro na
 * tela, com "Tentar de novo", nunca um inventário vazio.
 */
export default async function PaginaInventarioDex() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  let lido;
  try {
    lido = await Promise.all([listarFormasDex(db), listarJogosPossuidos(db), listarRegistrosDex(db)]);
  } catch (erro) {
    console.error("inventário da dex: falha ao ler", erro);
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

  const [formas, jogos, registros] = lido;
  return <InventarioDex formas={formas} jogos={jogos} registros={registros} />;
}
