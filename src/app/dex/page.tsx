import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { VisaoGeralDex } from "./visao-geral-dex";

/**
 * /dex — Visão geral da Living Dex: progresso no HOME, o HOME e cada jogo
 * como uma coleção, troféus, plano ativo e o que falta levar ao HOME.
 * 404 com o módulo desligado; `connection()` antes da flag, como as outras.
 */
export default async function VisaoGeralDexPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, secoes, registros, jogos, trofeus, planos] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    listarJogosPossuidos(db),
    listarTrofeus(db),
    listarPlanos(db),
  ]);
  return (
    <VisaoGeralDex
      formas={formas}
      secoes={secoes}
      registros={registros}
      jogos={jogos}
      trofeus={trofeus}
      planos={planos.filter((p) => p.status === "ativo")}
    />
  );
}
