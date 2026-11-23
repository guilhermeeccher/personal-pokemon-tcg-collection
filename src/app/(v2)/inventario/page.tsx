import { exigirSessao } from "@/lib/acesso";

import { filtrosDaUrl, paginaDaUrl } from "./_componentes/estado-inventario";
import { Inventario } from "./_componentes/inventario";

/**
 * Inventário da v2 (pacote 2b). A lista e os filtros vivem no cliente, sobre
 * `GET /api/copias`, como na v1; este invólucro de servidor confere a sessão e
 * lê os filtros da URL — as mesmas chaves da v1 (`estado-inventario.ts`) —, para
 * a primeira pintura já sair com o recorte pedido, sem ler `window.location`
 * depois de montar.
 */
export default async function PaginaInventario({ searchParams }: PageProps<"/inventario">) {
  await exigirSessao();
  const busca = await searchParams;
  return <Inventario filtrosIniciais={filtrosDaUrl(busca)} paginaInicial={paginaDaUrl(busca)} />;
}
