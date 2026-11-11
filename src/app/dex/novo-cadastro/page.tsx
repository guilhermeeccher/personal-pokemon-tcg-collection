import { notFound } from "next/navigation";
import { connection } from "next/server";

import { exigirSessao } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import {
  lerCaixasReservadas,
  lerSecoesDex,
  listarFormasDex,
  listarJogosPossuidos,
  listarRegistrosDex,
} from "@/lib/db/dex";
import { listarTrofeus } from "@/lib/db/dex-planejamento";
import { moduloLivingDexAtivo } from "@/lib/modulos";

import { NovoCadastro } from "./novo-cadastro";

/**
 * /dex/novo-cadastro — escolher na grade das caixas o que está indo ao HOME
 * e depois dizer de que jogo saiu (`POST /api/dex/registros/enviar`). Carrega
 * o que as Caixas carregam, mais os jogos ativos e os checkpoints pendentes,
 * que dão as marcas do lote como no Cadastrar. 404 com o módulo desligado;
 * `connection()` antes da flag pelo mesmo motivo da Pokédex.
 */
export default async function NovoCadastroPage() {
  await exigirSessao();
  await connection();
  if (!moduloLivingDexAtivo()) notFound();

  const [formas, secoes, registros, caixasReservadas, jogos, trofeus] = await Promise.all([
    listarFormasDex(db),
    lerSecoesDex(db),
    listarRegistrosDex(db),
    lerCaixasReservadas(db),
    listarJogosPossuidos(db),
    listarTrofeus(db),
  ]);

  return (
    <NovoCadastro
      formas={formas}
      secoes={secoes}
      registros={registros}
      caixasReservadas={caixasReservadas}
      // Só jogo ativo é saída: jogo parado não recebe nem manda (a rota recusa).
      jogos={jogos.filter((j) => j.ativo)}
      checkpoints={trofeus.filter((t) => t.tipo === "checkpoint" && !t.obtido)}
    />
  );
}
