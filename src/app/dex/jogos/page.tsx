import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarJogosPossuidos } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { ListaJogos } from "./lista-jogos";

/** /dex/jogos — os jogos que o usuário tem. 404 com o módulo desligado. */
export default async function JogosPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();
  return <ListaJogos jogos={await listarJogosPossuidos(db)} />;
}
