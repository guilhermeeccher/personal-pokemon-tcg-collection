import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  listarColecoes,
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
 * progresso das coleções. Seis consultas em paralelo, todas agregadas em
 * SQL (ver comentários em `lib/db/consultas.ts`) — nenhuma traz linha por
 * cópia para somar aqui.
 *
 * `colecoes` é o retorno de `listarColecoes` sem nenhum recálculo — o
 * mesmo dado que `GET /api/colecoes` expõe, reaproveitado (pedido
 * explícito da tarefa: "não recalcule por fora").
 */
export async function GET() {
  const [totais, porExpansao, porRaridade, porIdioma, porCondicao, porVariante, colecoes] =
    await Promise.all([
      obterTotaisInventario(db),
      obterDistribuicaoPorExpansao(db),
      obterDistribuicaoPorRaridade(db),
      obterDistribuicaoPorIdioma(db),
      obterDistribuicaoPorCondicao(db),
      obterDistribuicaoPorVariante(db),
      listarColecoes(db),
    ]);

  return NextResponse.json({
    totais,
    distribuicoes: { porExpansao, porRaridade, porIdioma, porCondicao, porVariante },
    colecoes,
  });
}
