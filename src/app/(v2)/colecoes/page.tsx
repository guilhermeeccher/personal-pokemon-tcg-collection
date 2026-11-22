import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerListaColecoesV2 } from "@/lib/db/lista-colecoes-v2";
import type { ListaColecoesV2DTO } from "@/lib/dominio/lista-colecoes-v2";

import { AvisoEmLinha } from "../_componentes/primitivos/painel";
import { ListaColecoes } from "./_componentes/lista-colecoes";
import { TentarDeNovo } from "./_componentes/tentar-de-novo";

/**
 * Lista de coleções da v2, modo "ver" (pacote 1c). Lê no servidor — a mesma
 * ordem de `GET /api/colecoes`, mais a capa, o logo e as vagas vazias que a
 * vitrine já sabe ler — e entrega ao cartão só o que ele desenha.
 *
 * `connection()`: a página lê o banco a cada requisição, e o build não tem
 * banco. Uma leitura que falha não vira lista vazia (que diria "nenhuma
 * coleção" a quem tem dezenas): vira erro na tela, com "Tentar de novo".
 */
export default async function PaginaColecoes() {
  await exigirSessao();
  await connection();

  let lista: ListaColecoesV2DTO;
  try {
    lista = await lerListaColecoesV2(db);
  } catch (erro) {
    console.error("lista de coleções: falha ao ler", erro);
    const t = await getTranslations("v2Colecoes");
    return (
      <AvisoEmLinha tom="perigo" papel="alert" titulo={t("erroCarregar")} acao={<TentarDeNovo />}>
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  return <ListaColecoes lista={lista} />;
}
