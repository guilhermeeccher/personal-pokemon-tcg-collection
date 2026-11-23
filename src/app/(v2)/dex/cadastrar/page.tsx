import { notFound } from "next/navigation";
import { connection } from "next/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { compararPorNome } from "@/lib/dominio/dex-inventario";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { CadastroPorJogo } from "./_componentes/cadastro-por-jogo";
import type { TenhoDex } from "./_componentes/lote-dex";

/**
 * `/dex/cadastrar` — o cadastro por jogo na v2 (pacote 5c). As leituras são as
 * da página da v1 (`(v1)/v1/dex/cadastrar/page.tsx`), no servidor: o catálogo
 * em ordem de nome, os jogos possuídos ativos, o "tenho" contado dos
 * registros, as seções e os checkpoints ainda não conquistados.
 *
 * `?busca=` chega da Pokédex e da visão geral com o número preenchido;
 * `?jogo=`, do fim de uma tarefa de plano, com o jogo dela — as mesmas chaves
 * da v1. A guarda do módulo vem antes de tudo (`rules.md`, "Dex shared
 * code", A): desligado, 404 direto, sem tocar no banco. Uma leitura que falha
 * vira erro na tela, com "Tentar de novo", nunca uma lista vazia; numa
 * releitura, a tela fica com a leitura anterior e o lote digitado
 * (`CadastroPorJogo`, `leitura` nulo).
 */
export default async function PaginaCadastrarDex({ searchParams }: PageProps<"/dex/cadastrar">) {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const params = await searchParams;
  const buscaInicial = typeof params.busca === "string" ? params.busca : "";
  const jogoInicial = typeof params.jogo === "string" ? params.jogo : "";

  let lido;
  try {
    lido = await Promise.all([
      listarFormasDex(db),
      listarJogosPossuidos(db),
      listarRegistrosDex(db),
      lerSecoesDex(db),
      listarTrofeus(db),
    ]);
  } catch (erro) {
    console.error("cadastro da dex: falha ao ler", erro);
    return <CadastroPorJogo leitura={null} buscaInicial={buscaInicial} jogoInicial={jogoInicial} />;
  }

  const [formas, jogos, registros, secoes, trofeus] = lido;

  const tenho: Record<string, { normal: number; shiny: number }> = {};
  for (const r of registros) {
    const t = (tenho[r.formaId] ??= { normal: 0, shiny: 0 });
    if (r.shiny) t.shiny++;
    else t.normal++;
  }

  return (
    <CadastroPorJogo
      leitura={{
        formas: [...formas].sort(compararPorNome),
        jogos: jogos.filter((j) => j.ativo),
        tenho: tenho satisfies TenhoDex,
        secoes,
        checkpoints: trofeus.filter((t) => t.tipo === "checkpoint" && !t.obtido),
      }}
      buscaInicial={buscaInicial}
      jogoInicial={jogoInicial}
    />
  );
}
