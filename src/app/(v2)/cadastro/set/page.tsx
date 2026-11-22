import { exigirSessao } from "@/lib/acesso";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/** Ponte: a v2 ainda não tem esta tela (`_ponte/ir-para-v1.ts`). */
export default async function PonteCadastroSet({ searchParams }: PageProps<"/cadastro/set">) {
  await exigirSessao();
  irParaV1(["cadastro", "set"], await searchParams);
}
