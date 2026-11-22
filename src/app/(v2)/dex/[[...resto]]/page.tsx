import { notFound } from "next/navigation";

import { exigirSessao } from "@/lib/acesso";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/**
 * Ponte única da Living Dex: toda `/dex/...` vai para a mesma tela em
 * `/v1/dex/...`, até a v2 da Dex sair tela a tela (aí este catch-all vira uma
 * ponte por tela). É o único catch-all da v2, e fica abaixo de `/dex` de
 * propósito (`_ponte/ir-para-v1.ts`).
 *
 * **Módulo desligado: 404 direto, sem um 307 antes.** Desligada, a Dex não
 * existe, e um redirecionamento diria o contrário. A flag é lida por
 * requisição (o `exigirSessao` já chamou `connection()`), e é por isso que a
 * ponte é página e não regra do `next.config.ts`: a imagem é construída sem o
 * `.env`.
 */
export default async function PonteDex({ params, searchParams }: PageProps<"/dex/[[...resto]]">) {
  await exigirSessao();
  if (!moduloLivingDexAtivo()) notFound();
  const { resto = [] } = await params;
  irParaV1(["dex", ...resto], await searchParams);
}
