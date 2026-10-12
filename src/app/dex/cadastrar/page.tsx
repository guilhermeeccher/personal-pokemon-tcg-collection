import { notFound } from "next/navigation";
import { connection } from "next/server";

import { db } from "@/lib/db/client";
import { listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { compararPorNome } from "@/lib/dominio/dex-inventario";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { CadastroPorJogo } from "./cadastro-por-jogo";

/**
 * /dex/cadastrar — cadastro por jogo, como o cadastro por set das cartas.
 * `?busca=` chega da grade da Pokédex com o filtro preenchido.
 */
export default async function CadastrarPage({ searchParams }: PageProps<"/dex/cadastrar">) {
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, jogos, registros, params] = await Promise.all([
    listarFormasDex(db),
    listarJogosPossuidos(db),
    listarRegistrosDex(db),
    searchParams,
  ]);

  const tenho: Record<string, { normal: number; shiny: number }> = {};
  for (const r of registros) {
    const t = (tenho[r.formaId] ??= { normal: 0, shiny: 0 });
    if (r.shiny) t.shiny++;
    else t.normal++;
  }

  return (
    <CadastroPorJogo
      formas={[...formas].sort(compararPorNome)}
      jogos={jogos.filter((j) => j.ativo)}
      tenho={tenho}
      buscaInicial={typeof params.busca === "string" ? params.busca : ""}
    />
  );
}
