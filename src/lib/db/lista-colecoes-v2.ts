/**
 * A leitura da lista de coleções da v2 (`/colecoes`, modo "ver"): as coleções
 * na ordem de `listarColecoes` com capa, logo e divisões (as mesmas consultas
 * da visão geral e da página inicial), os grupos e, só como ilustração, as
 * primeiras vagas vazias das coleções mais perto de fechar.
 *
 * Fica fora de `page.tsx` para a montagem poder ser lida (e testada, na parte
 * pura, em `lib/dominio/lista-colecoes-v2.ts`) sem passar pelo Next.
 *
 * **Duas leituras, não uma transação.** `GET /api/colecoes` lê coleções e
 * grupos num REPEATABLE READ para todo `grupoId` estar em `grupos`; as
 * consultas da vitrine só aceitam a conexão, não a transação. Aqui isso não
 * custa nada: uma coleção cujo grupo já não vem na leitura dos grupos cai em
 * "sem grupo" (`secoesDaLista`), nunca some, e a tela é só leitura.
 */
import { montarListaV2, miniaturasPorColecao, type ListaColecoesV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import { urlImagemCarta, urlSpritePokemon } from "@/lib/imagens";

import type { Database } from "./client";
import { listarColecoesNaVitrine, listarQuaseLa } from "./consultas";
import { listarGruposColecao } from "./grupos-colecao";

/**
 * Quantas coleções ganham as primeiras vagas vazias. `listarQuaseLa` lê cada
 * coleção escolhida inteira (uma Pokédex tem 1.025 vagas), então o número é
 * de propósito pequeno e não cresce com o de coleções.
 */
export const COLECOES_COM_MINIATURAS = 6;
export const MINIATURAS_POR_COLECAO = 4;

const resolvedores = {
  imagemDaCarta: (imagemUrl: string | null) => urlImagemCarta(imagemUrl, "low"),
  spriteDaEspecie: urlSpritePokemon,
};

export async function lerListaColecoesV2(db: Database): Promise<ListaColecoesV2DTO> {
  const [vitrine, grupos] = await Promise.all([listarColecoesNaVitrine(db), listarGruposColecao(db)]);

  // As miniaturas são enfeite: se a leitura delas falha, a lista sai sem elas
  // em vez de cair junto — o que a tela existe para mostrar já foi lido.
  let quaseLa: Awaited<ReturnType<typeof listarQuaseLa>> = [];
  try {
    quaseLa = await listarQuaseLa(db, vitrine, COLECOES_COM_MINIATURAS, MINIATURAS_POR_COLECAO);
  } catch (erro) {
    console.error("lista de coleções: as miniaturas das vagas vazias não carregaram", erro);
  }

  return montarListaV2(
    vitrine,
    grupos,
    miniaturasPorColecao(quaseLa, resolvedores, MINIATURAS_POR_COLECAO),
    resolvedores,
  );
}
