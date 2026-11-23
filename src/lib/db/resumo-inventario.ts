/**
 * A leitura de `GET /api/inventario/resumo`, fora do handler para a v1 (que a
 * chama pela rota) e a visão geral da v2 (que a lê direto no servidor, sem
 * passar pela rede) serem **a mesma leitura**: "mesmas leituras da v1" é uma
 * garantia de código, não de cuidado.
 *
 * `colecoes` é o retorno de `listarColecoes` sem nenhum recálculo — o mesmo
 * dado que `GET /api/colecoes` expõe —, mais divisões, capa e logo
 * (`listarColecoesNaVitrine`, 2026-10-05). `joias` e `quaseLa` são a vitrine:
 * as cartas que mais valem no inventário e as divisões mais perto de fechar.
 * `quaseLa` depende das divisões, por isso roda depois.
 */

import type { Database } from "./client";
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
} from "./consultas";

export const LIMITE_JOIAS = 8;
export const LIMITE_QUASE_LA = 3;
export const FALTANTES_POR_DIVISAO = 6;

export async function lerResumoInventario(db: Database) {
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

  return {
    totais,
    distribuicoes: { porExpansao, porRaridade, porIdioma, porCondicao, porVariante },
    colecoes,
    joias,
    quaseLa,
  };
}

/** O que a leitura entrega, com os tipos do servidor (datas como `Date`; o JSON da rota as achata em texto). */
export type ResumoInventario = Awaited<ReturnType<typeof lerResumoInventario>>;
