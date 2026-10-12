import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { InventarioDex } from "./inventario-dex";

/** /dex/inventario — os Pokémon cadastrados, agrupados. 404 com o módulo desligado. */
export default async function InventarioDexPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, jogos, registros] = await Promise.all([
    listarFormasDex(db),
    listarJogosPossuidos(db),
    listarRegistrosDex(db),
  ]);
  return <InventarioDex formas={formas} jogos={jogos} registros={registros} />;
}
