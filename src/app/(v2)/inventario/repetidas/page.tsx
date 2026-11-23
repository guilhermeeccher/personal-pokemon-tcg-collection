import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarCartasRepetidas } from "@/lib/db/consultas";
import { copiasRepresentantes } from "@/lib/db/copia-representante";
import { filtrosDaUrl, hrefRepetidas, totalDePaginas } from "@/lib/dominio/repetidas-v2";

import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import { TentarDeNovo } from "../visao-geral/_componentes/tentar-de-novo";
import { rotuloDaRaridade } from "../visao-geral/_componentes/rotulos";

import { ListaRepetidas, type RepetidaDaTela } from "./_componentes/lista-repetidas";

/**
 * Repetidas da v2 (pacote 2c): a mesma consulta de
 * `GET /api/inventario/repetidas` (`listarCartasRepetidas`, a definição
 * fechada de repetida), lida no servidor, mais a cópia pela qual o detalhe de
 * cada carta abre. O filtro e a página vêm da URL.
 *
 * Uma página além da última (um link velho, ou repetidas que sumiram depois de
 * editar cópias) leva à última que existe, em vez de mostrar "nenhuma repetida"
 * a quem tem cinquenta.
 */
export default async function PaginaRepetidas({ searchParams }: PageProps<"/inventario/repetidas">) {
  await exigirSessao();
  await connection();

  const filtros = filtrosDaUrl(await searchParams);

  let lido: Awaited<ReturnType<typeof listarCartasRepetidas>>;
  let copiaPorCarta: Map<string, string>;
  try {
    lido = await listarCartasRepetidas(db, filtros);
    copiaPorCarta = await copiasRepresentantes(
      db,
      lido.itens.map((i) => i.cartaId),
    );
  } catch (erro) {
    console.error("repetidas: falha ao ler", erro);
    const t = await getTranslations("v2Repetidas");
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

  const paginas = totalDePaginas(lido.total, filtros.tamanhoPagina);
  if (filtros.pagina > paginas) redirect(hrefRepetidas({ soLivres: filtros.soLivres, pagina: paginas }));

  const tRaridades = await getTranslations("raridadesCarta");
  const tCom = await getTranslations("componentes");
  const itens: RepetidaDaTela[] = lido.itens.map((i) => ({
    cartaId: i.cartaId,
    copiaId: copiaPorCarta.get(i.cartaId) ?? null,
    nome: i.cartaNome,
    localId: i.cartaLocalId,
    setNome: i.setNome,
    raridade: rotuloDaRaridade(tRaridades, tCom("semRaridade"), i.raridade),
    raridadeCrua: i.raridade,
    imagemUrl: i.imagemUrl,
    imagemOrigem: i.imagemOrigem,
    total: i.total,
    alocadas: i.alocadas,
    livres: i.livres,
    idiomas: i.idiomas,
  }));

  return (
    <ListaRepetidas
      itens={itens}
      total={lido.total}
      soLivres={filtros.soLivres}
      pagina={filtros.pagina}
      totalPaginas={paginas}
    />
  );
}
