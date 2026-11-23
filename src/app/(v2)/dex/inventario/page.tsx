import { notFound } from "next/navigation";

import { exigirSessao } from "@/lib/acesso";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";

/**
 * Ponte: a v2 ainda não tem esta tela (`_ponte/ir-para-v1.ts`). Módulo
 * desligado: 404 direto, antes de qualquer 307 — a flag é lida por requisição
 * (o `exigirSessao` já chamou `connection()`), nunca em tempo de build.
 */
export default async function PonteDexInventario({ searchParams }: PageProps<"/dex/inventario">) {
  await exigirSessao();
  if (!moduloLivingDexAtivo()) notFound();
  irParaV1(["dex", "inventario"], await searchParams);
}
