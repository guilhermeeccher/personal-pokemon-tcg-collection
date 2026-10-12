import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { lerCaixasReservadas, lerSecoesDex, listarFormasDex, listarRegistrosDex } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { GradePokedex } from "./grade-pokedex";

/**
 * /dex/pokedex — grade da Living Dex. 404 com o módulo desligado.
 *
 * `connection()` antes da flag: sem ele o Next pode pré-renderizar a página
 * no build, quando o `.env` não existe, e a flag ficaria presa no valor do
 * build (sempre desligada).
 */
export default async function PokedexPage() {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, secoes, registros, caixasReservadas] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    lerCaixasReservadas(db),
  ]);
  return (
    <GradePokedex formas={formas} secoesIniciais={secoes} registros={registros} caixasReservadas={caixasReservadas} />
  );
}
