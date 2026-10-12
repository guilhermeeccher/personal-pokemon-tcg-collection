import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { CaixasHome } from "./caixas-home";

/**
 * /dex/caixas — as caixas do HOME, com a caixa e a posição de cada vaga
 * (`dex-caixas.ts`). 404 com o módulo desligado; `connection()` antes da
 * flag pelo mesmo motivo da Pokédex.
 */
export default async function CaixasPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, secoes, registros, caixasReservadas] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    lerCaixasReservadas(db),
  ]);
  return <CaixasHome formas={formas} secoes={secoes} registros={registros} caixasReservadas={caixasReservadas} />;
}
