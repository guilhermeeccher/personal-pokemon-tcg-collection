/**
 * A leitura da página inicial da v2 (`/`, pacote 2a). Só `select`; a página
 * lê no servidor e não há rota nova: depois de uma escrita no detalhe da
 * carta, a tela pede `router.refresh()` e esta leitura roda de novo.
 *
 * - **O TCG é o da v1** (`lerTcgInicio`): totais, as quatro primeiras coleções
 *   na ordem de `listarColecoes` e o "Quase lá" calculado sobre **todas** elas.
 * - **A vitrine é a das joias** da visão geral (`listarJoias`), cortada em três,
 *   mais a cópia que o toque abre e a procedência da imagem
 *   (`montarVitrine`).
 * - **As cadastradas** são as cópias com `criado_em` dentro da janela de
 *   `cadastradas-recentes.ts`: a contagem de todas numa consulta agregada, as
 *   mais recentes noutra.
 *
 * Leituras separadas, não uma transação: as funções da vitrine só aceitam a
 * conexão. Uma cópia cadastrada entre duas delas no máximo aparece num bloco
 * e não no outro até o próximo carregamento — a tela é só leitura.
 */

import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import {
  cadastradasNaJanela,
  janelaCadastradas,
  LIMITE_CADASTRADAS,
} from "@/lib/dominio/cadastradas-recentes";
import { CARTAS_NA_VITRINE, montarVitrine, type CadastradasInicioV2, type CartaDoInicioV2 } from "@/lib/dominio/inicio-v2";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";

import type { Database } from "./client";
import { imagemDaCarta, listarJoias, origemDaImagem } from "./consultas";
import { lerTcgInicio, type TcgInicio } from "./inicio";
import { cartaCatalogo, copia } from "./schema";

export interface TcgInicioV2 extends TcgInicio {
  vitrine: CartaDoInicioV2[];
  cadastradas: CadastradasInicioV2;
}

export async function lerInicioV2(db: Database, agora: Date): Promise<TcgInicioV2> {
  const [tcg, vitrine, cadastradas] = await Promise.all([
    lerTcgInicio(db),
    lerVitrine(db),
    lerCadastradas(db, agora),
  ]);
  return { ...tcg, vitrine, cadastradas };
}

async function lerVitrine(db: Database): Promise<CartaDoInicioV2[]> {
  const joias = await listarJoias(db, CARTAS_NA_VITRINE);
  if (joias.length === 0) return [];
  const cartaIds = joias.map((j) => j.cartaId);
  const [copias, imagens] = await Promise.all([
    db
      .select({
        id: copia.id,
        cartaId: copia.cartaId,
        variante: copia.variante,
        idioma: copia.idioma,
        criadoEm: copia.criadoEm,
      })
      .from(copia)
      .where(inArray(copia.cartaId, cartaIds))
      .orderBy(asc(copia.criadoEm), asc(copia.id)),
    // A procedência sai do mesmo degrau da URL (`imagemDaCarta`), na linha que
    // a joia mostra: duas leituras separadas poderiam dar foto de um degrau
    // com o selo de outro.
    db
      .select({
        cartaId: cartaCatalogo.id,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      })
      .from(cartaCatalogo)
      .where(or(...joias.map((j) => and(eq(cartaCatalogo.id, j.cartaId), eq(cartaCatalogo.idioma, j.idioma))))),
  ]);
  return montarVitrine(
    joias,
    copias,
    new Map(imagens.map((i) => [i.cartaId, { imagemUrl: i.imagemUrl, imagemOrigem: (i.imagemOrigem as OrigemImagem | null) ?? null }])),
  );
}

async function lerCadastradas(db: Database, agora: Date): Promise<CadastradasInicioV2> {
  const janela = janelaCadastradas(agora);
  const naJanela = gte(copia.criadoEm, janela.inicio);
  const [[contagem], linhas] = await Promise.all([
    db
      .select({
        copias: sql<number>`count(*)::int`,
        unidades: sql<number>`coalesce(sum(${copia.quantidade}), 0)::int`,
        cartas: sql<number>`count(distinct ${copia.cartaId})::int`,
      })
      .from(copia)
      .where(naJanela),
    db
      .select({
        copiaId: copia.id,
        cartaId: copia.cartaId,
        quantidade: copia.quantidade,
        variante: copia.variante,
        idioma: copia.idioma,
        criadoEm: copia.criadoEm,
        nome: cartaCatalogo.nome,
        setNome: cartaCatalogo.setNome,
        localId: cartaCatalogo.localId,
        raridade: cartaCatalogo.raridade,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      })
      .from(copia)
      .innerJoin(
        cartaCatalogo,
        and(eq(copia.cartaId, cartaCatalogo.id), eq(copia.idiomaCatalogo, cartaCatalogo.idioma)),
      )
      .where(naJanela)
      .orderBy(desc(copia.criadoEm), desc(copia.id))
      .limit(LIMITE_CADASTRADAS),
  ]);
  const itens = cadastradasNaJanela(linhas, janela).map((l) => ({
    cartaId: l.cartaId,
    copiaId: l.copiaId,
    nome: l.nome,
    setNome: l.setNome,
    localId: l.localId,
    raridade: l.raridade,
    variante: l.variante,
    idioma: l.idioma,
    imagemUrl: l.imagemUrl,
    imagemOrigem: (l.imagemOrigem as OrigemImagem | null) ?? null,
    quantidade: l.quantidade,
    dia: l.dia,
  }));
  return {
    hoje: janela.hoje,
    desde: janela.desde,
    copias: contagem?.copias ?? 0,
    unidades: contagem?.unidades ?? 0,
    cartas: contagem?.cartas ?? 0,
    itens,
  };
}
