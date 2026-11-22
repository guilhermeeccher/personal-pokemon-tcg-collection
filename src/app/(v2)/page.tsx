import { exigirSessao } from "@/lib/acesso";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/** Ponte: a v2 ainda não tem esta tela (`_ponte/ir-para-v1.ts`). A página
 *  inicial da v1 é `/v1`. */
export default async function PontePaginaInicial({ searchParams }: PageProps<"/">) {
  await exigirSessao();
  irParaV1([], await searchParams);
}
