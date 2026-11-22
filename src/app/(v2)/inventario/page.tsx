import { exigirSessao } from "@/lib/acesso";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/** Ponte: a v2 ainda não tem esta tela (`_ponte/ir-para-v1.ts`). */
export default async function PonteInventario({ searchParams }: PageProps<"/inventario">) {
  await exigirSessao();
  irParaV1(["inventario"], await searchParams);
}
