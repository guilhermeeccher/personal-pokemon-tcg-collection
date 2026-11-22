import { exigirSessao } from "@/lib/acesso";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/** Ponte: a v2 ainda não tem esta tela (`_ponte/ir-para-v1.ts`). */
export default async function PonteOpcoesCompra({ params, searchParams }: PageProps<"/colecoes/[id]/opcoes-compra">) {
  await exigirSessao();
  const { id } = await params;
  irParaV1(["colecoes", id, "opcoes-compra"], await searchParams);
}
