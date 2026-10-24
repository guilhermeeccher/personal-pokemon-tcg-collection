/**
 * A parte do TCG da página inicial (`/`): as leituras e a montagem dos DTOs.
 *
 * Mora aqui, e não em `app/page.tsx`, para poder ser testada: um `page.tsx`
 * só exporta o que o Next aceita, e a ligação que importa proteger é a das
 * consultas entre si — o "Quase lá" recebe **todas** as coleções de
 * `listarColecoesNaVitrine`, e o corte em 4 (`colecoesNoInicio`) é só da
 * lista "Suas coleções", depois. Passar a lista cortada faria uma divisão
 * da quinta coleção, a mais perto de fechar, sumir em silêncio da página
 * inicial enquanto aparece na visão geral. `inicio.test.ts` prova a ligação
 * com as consultas simuladas, sem banco.
 *
 * As consultas são as mesmas de `GET /api/inventario/resumo`, para os
 * números serem os da visão geral.
 */
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import { colecoesNoInicio } from "@/lib/dominio/resumo-inicio";
import type { ColecaoInicioDTO, QuaseLaInicioDTO, TotaisInicioDTO } from "@/lib/dominio/tipos-cliente";
import { urlImagemCarta, urlSpritePokemon } from "@/lib/imagens";

import type { Database } from "./client";
import { listarColecoesNaVitrine, listarQuaseLa, obterTotaisInventario, type QuaseLa } from "./consultas";

export const QUASE_LA_NO_INICIO = 3;
export const MINIATURAS_POR_DIVISAO = 4;

export interface TcgInicio {
  totais: TotaisInicioDTO;
  colecoes: ColecaoInicioDTO[];
  totalColecoes: number;
  quaseLa: QuaseLaInicioDTO[];
}

export async function lerTcgInicio(db: Database): Promise<TcgInicio> {
  const [totais, todas] = await Promise.all([obterTotaisInventario(db), listarColecoesNaVitrine(db)]);
  // Todas, antes do corte: ver o comentário do topo.
  const quaseLa = await listarQuaseLa(db, todas, QUASE_LA_NO_INICIO, MINIATURAS_POR_DIVISAO);
  const { colecoes, sobram } = colecoesNoInicio(todas);
  return {
    totais: { cartasDistintas: totais.cartasDistintas, totalUnidades: totais.totalUnidades },
    colecoes,
    totalColecoes: colecoes.length + sobram,
    quaseLa: quaseLa.map(quaseLaDoInicio),
  };
}

/** A URL de cada miniatura resolvida aqui, como a visão geral resolve no cliente. */
function quaseLaDoInicio(q: QuaseLa): QuaseLaInicioDTO {
  return {
    colecaoId: q.colecaoId,
    colecaoNome: q.colecaoNome,
    divisao: q.divisao,
    faltam: q.faltam,
    miniaturas: q.faltantes.slice(0, MINIATURAS_POR_DIVISAO).map((f) => ({
      // Pokédex não tem "a carta esperada" (regra 3): o sprite da espécie.
      url: q.tipo === "pokedex" ? urlSpritePokemon(f.chave) : urlImagemCarta(f.imagemUrl, "low"),
      rotulo: rotuloChaveVaga(f.chave),
    })),
  };
}
