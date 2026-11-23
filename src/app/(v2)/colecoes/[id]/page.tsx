import { exigirSessao } from "@/lib/acesso";

import { PaginaColecao } from "./pagina-cliente";

/**
 * A coleção na v2 (pacote 1d): o fichário, a lista inteira, os upgrades e o
 * que falta, com o detalhe de carta do pacote 1b. A página é de cliente
 * (`pagina-cliente.tsx`): ela lê a grade pela API e relê a cada escrita, e o
 * detalhe é estado de cliente sobre ela, não uma rota (regra 7 de
 * `docs/design-v2/rules.md`).
 */
export default async function PaginaDaColecao({ params }: PageProps<"/colecoes/[id]">) {
  await exigirSessao();
  const { id } = await params;
  return <PaginaColecao id={id} />;
}
