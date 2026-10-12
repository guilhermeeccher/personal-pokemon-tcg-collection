import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos } from "@/lib/db/dex";
import { listarPlanos, listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { PainelPlanos } from "./painel-planos";

/** /dex/planos — planos ativos com tarefas, e o histórico. */
export default async function PlanosPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();
  const [planos, trofeus, jogos, formas] = await Promise.all([
    listarPlanos(db),
    listarTrofeus(db),
    listarJogosPossuidos(db),
    listarFormasDex(db),
  ]);
  // Só as vagas que alguma tarefa mira: o catálogo inteiro não precisa ir ao navegador.
  const usadas = new Set(planos.flatMap((p) => p.tarefas.flatMap((t) => t.formaIds)));
  return (
    <PainelPlanos
      planos={planos}
      trofeus={trofeus.map((t) => ({ id: t.id, jogoId: t.jogoId, textos: t.textos }))}
      jogos={jogos}
      formas={formas.filter((f) => usadas.has(f.id))}
    />
  );
}
