import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarColecoes, obterColecaoComVagas } from "@/lib/db/consultas";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../_componentes/tentar-de-novo";

import { type ColecaoFaltaGeral, entraNaFalta, vagasVazias } from "./_componentes/falta-geral";
import { FaltaGeral } from "./_componentes/lista-falta-geral";

/**
 * "O que falta" de todas as coleções na v2 (pacote 1e; trocou a ponte). A
 * leitura é a da v1, no servidor: `listarColecoes` (a lista já na ordem de
 * exibição — nunca reordenada aqui) e, para cada Pokédex ou set com vaga
 * vazia, `obterColecaoComVagas`, a função de `GET /api/colecoes/:id` que a
 * tela da v1 chamava uma a uma, com a contagem de cópias livres por vaga.
 * Tudo numa transação só de leitura: as coleções e as vagas do mesmo
 * instante.
 */
export default async function PaginaFalta() {
  await exigirSessao();
  await connection();

  let colecoes: ColecaoFaltaGeral[];
  try {
    colecoes = await db.transaction(
      async (tx) => {
        const lista = (await listarColecoes(tx)).filter(entraNaFalta);
        const saida: ColecaoFaltaGeral[] = [];
        for (const c of lista) {
          const comVagas = await obterColecaoComVagas(tx, c.id);
          if (!comVagas) continue;
          saida.push({ id: c.id, nome: c.nome, tipo: c.tipo, vagas: vagasVazias(comVagas.vagas) });
        }
        return saida;
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (erro) {
    console.error("o que falta: falha ao ler", erro);
    const t = await getTranslations("v2Falta.geral");
    return (
      <AvisoEmLinha tom="perigo" papel="alert" titulo={t("erroCarregar")} acao={<TentarDeNovo />}>
        {t("erroCarregarTexto")}
      </AvisoEmLinha>
    );
  }

  return <FaltaGeral colecoes={colecoes} />;
}
