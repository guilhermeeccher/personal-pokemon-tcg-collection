import { notFound } from "next/navigation";
import { connection } from "next/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { listarJogosPossuidos } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { progressoTrofeus } from "@/lib/dominio/dex-trofeus";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { ListaJogos } from "./lista-jogos";

/** /dex/jogos — os jogos que o usuário tem, com o andamento dos troféus. 404 com o módulo desligado. */
export default async function JogosPage() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();
  const [jogos, trofeus] = await Promise.all([listarJogosPossuidos(db), listarTrofeus(db)]);
  const obtidos = new Set(trofeus.filter((t) => t.obtido).map((t) => t.id));
  const progresso = Object.fromEntries(
    jogos.map((j) => {
      const p = progressoTrofeus(trofeus, j.jogoId, obtidos);
      return [j.jogoId, { obtidos: p.obtidos, total: p.total, platina: p.platina }];
    }),
  );
  return <ListaJogos jogos={jogos} trofeus={progresso} />;
}
