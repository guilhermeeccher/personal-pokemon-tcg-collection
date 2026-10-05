import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  listarColecoesNaVitrine,
  listarJoias,
  listarQuaseLa,
  obterDistribuicaoPorCondicao,
  obterDistribuicaoPorExpansao,
  obterDistribuicaoPorIdioma,
  obterDistribuicaoPorRaridade,
  obterDistribuicaoPorVariante,
  obterTotaisInventario,
} from "@/lib/db/consultas";

/**
 * GET /api/inventario/resumo — item 1 ("visão geral"): totais, as cinco
 * distribuições (expansão, raridade, idioma, condição, variante) e o
 * progresso das coleções. As distribuições e os totais são agregados em
 * SQL (ver comentários em `lib/db/consultas.ts`) — nenhuma traz linha por
 * cópia para somar aqui.
 *
 * `colecoes` é o retorno de `listarColecoes` sem nenhum recálculo — o
 * mesmo dado que `GET /api/colecoes` expõe, reaproveitado (pedido
 * explícito da tarefa: "não recalcule por fora") — mais divisões, capa e
 * logo (`listarColecoesNaVitrine`, 2026-10-05). `joias` e `quaseLa` são a
 * vitrine: as cartas mais vistosas do inventário e as divisões mais perto
 * de fechar. `quaseLa` depende das divisões, por isso roda depois.
 */
const LIMITE_JOIAS = 8;
const LIMITE_QUASE_LA = 3;
const FALTANTES_POR_DIVISAO = 6;

export async function GET() {
  const [totais, porExpansao, porRaridade, porIdioma, porCondicao, porVariante, colecoes, joias] =
    await Promise.all([
      obterTotaisInventario(db),
      obterDistribuicaoPorExpansao(db),
      obterDistribuicaoPorRaridade(db),
      obterDistribuicaoPorIdioma(db),
      obterDistribuicaoPorCondicao(db),
      obterDistribuicaoPorVariante(db),
      listarColecoesNaVitrine(db),
      listarJoias(db, LIMITE_JOIAS),
    ]);
  const quaseLa = await listarQuaseLa(db, colecoes, LIMITE_QUASE_LA, FALTANTES_POR_DIVISAO);

  return NextResponse.json({
    totais,
    distribuicoes: { porExpansao, porRaridade, porIdioma, porCondicao, porVariante },
    colecoes,
    joias,
    quaseLa,
  });
}
