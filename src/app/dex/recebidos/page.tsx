import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { RecebidosHome } from "./recebidos-home";

/**
 * /dex/recebidos — o que chegou ao HOME e ainda não foi guardado, por caixa
 * de destino (`dex-recebidos.ts`, D9). 404 com o módulo desligado;
 * `connection()` antes da flag pelo mesmo motivo da Pokédex.
 */
export default async function RecebidosPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, secoes, registros, caixasReservadas] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    lerCaixasReservadas(db),
  ]);
  return <RecebidosHome formas={formas} secoes={secoes} registros={registros} caixasReservadas={caixasReservadas} />;
}
