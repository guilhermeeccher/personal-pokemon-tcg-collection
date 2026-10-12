import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarJogosPossuidos } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { PainelTrofeus } from "./painel-trofeus";

/** /dex/trofeus — os troféus de cada jogo que o usuário tem. `?jogo=` abre num jogo. */
export default async function TrofeusPage({ searchParams }: PageProps<"/dex/trofeus">) {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();
  const [jogos, trofeus, params] = await Promise.all([listarJogosPossuidos(db), listarTrofeus(db), searchParams]);
  const comTrofeus = jogos.filter((j) => trofeus.some((t) => t.jogoId === j.jogoId));
  return (
    <PainelTrofeus
      jogos={comTrofeus}
      trofeus={trofeus}
      jogoInicial={typeof params.jogo === "string" ? params.jogo : ""}
    />
  );
}
