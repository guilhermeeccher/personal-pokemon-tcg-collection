import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos } from "@/lib/db/dex";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { CadastroRegistro } from "./cadastro-registro";

/**
 * /dex/cadastrar — registrar um Pokémon e cuidar dos registros. 404 com o
 * módulo desligado. `?forma=<id>&shiny=1` chega da grade da Pokédex com a
 * vaga já escolhida.
 */
export default async function CadastrarPage({ searchParams }: PageProps<"/dex/cadastrar">) {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, jogos, params] = await Promise.all([listarFormasDex(db), listarJogosPossuidos(db), searchParams]);
  const forma = typeof params.forma === "string" ? params.forma : null;
  return (
    <CadastroRegistro
      formas={formas}
      jogos={jogos}
      formaInicial={formas.find((f) => f.id === forma) ?? null}
      shinyInicial={params.shiny === "1"}
    />
  );
}
