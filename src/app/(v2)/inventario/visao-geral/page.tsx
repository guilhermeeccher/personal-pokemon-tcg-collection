import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { copiasRepresentantes } from "@/lib/db/copia-representante";
import { lerOrigemPrecoCardmarket } from "@/lib/db/origem-preco-joias";
import { type ResumoInventario, lerResumoInventario } from "@/lib/db/resumo-inventario";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import type { OrigemPrecoCardmarket } from "@/lib/dominio/visao-geral-v2";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";

import { TentarDeNovo } from "./_componentes/tentar-de-novo";
import { VisaoGeral } from "./_componentes/visao-geral";

/**
 * Visão geral do inventário da v2 (pacote 2c). Lê no servidor, com a mesma
 * função de `GET /api/inventario/resumo`, e acrescenta duas leituras só das
 * joias (no máximo oito cartas): a cópia pela qual o detalhe abre e, no
 * Cardmarket, de onde veio o preço (euro, cotação, dia).
 *
 * `connection()`: a página lê o banco a cada requisição, e o build não tem
 * banco. Uma leitura que falha não vira um inventário vazio (que diria "nenhuma
 * carta" a quem tem milhares): vira erro na tela, com "Tentar de novo".
 */
export default async function PaginaVisaoGeral() {
  await exigirSessao();
  await connection();

  let resumo: ResumoInventario;
  let copiaPorCarta: Map<string, string>;
  let origemCardmarket: Map<string, OrigemPrecoCardmarket>;
  try {
    resumo = await lerResumoInventario(db);
    const cartaIds = resumo.joias.map((j) => j.cartaId);
    [copiaPorCarta, origemCardmarket] = await Promise.all([
      copiasRepresentantes(db, cartaIds),
      fonteDePreco() === "cardmarket" ? lerOrigemPrecoCardmarket(db, cartaIds) : Promise.resolve(new Map()),
    ]);
  } catch (erro) {
    console.error("visão geral: falha ao ler", erro);
    const t = await getTranslations("v2VisaoGeral");
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

  return <VisaoGeral resumo={resumo} copiaPorCarta={copiaPorCarta} origemCardmarket={origemCardmarket} />;
}
