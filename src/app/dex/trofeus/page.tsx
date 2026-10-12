import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { mapearEstadosDex } from "@/lib/dominio/dex-estado";
import { JOGO_HOME } from "@/lib/dominio/dex-trofeus";
import { comTrofeusDoHome } from "@/lib/dominio/dex-trofeus-home";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { PainelTrofeus } from "./painel-trofeus";

/**
 * /dex/trofeus — os troféus do HOME (calculados dos registros) e os de cada
 * jogo que o usuário tem. `?jogo=` abre num jogo.
 */
export default async function TrofeusPage({ searchParams }: PageProps<"/dex/trofeus">) {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();
  const [jogos, lista, formas, registros, secoes, params] = await Promise.all([
    listarJogosPossuidos(db),
    listarTrofeus(db),
    listarFormasDex(db),
    listarRegistrosDex(db),
    lerSecoesDex(db),
    searchParams,
  ]);
  const trofeus = comTrofeusDoHome(lista, formas, mapearEstadosDex(registros), secoes);
  const abas = [
    ...(trofeus.some((t) => t.jogoId === JOGO_HOME) ? [{ jogoId: JOGO_HOME, nome: "Pokémon HOME" }] : []),
    ...jogos.filter((j) => trofeus.some((t) => t.jogoId === j.jogoId)),
  ];
  return (
    <PainelTrofeus
      jogos={abas}
      trofeus={trofeus}
      jogoInicial={typeof params.jogo === "string" ? params.jogo : ""}
    />
  );
}
