/**
 * A ponte entre a triagem gravada (`escolha_compra`) e a lista de compras que
 * a tela mostra e a exportação baixa.
 *
 * Existe como módulo próprio, e não dentro de um `route.ts`, por dois motivos:
 * o App Router recusa export que não seja handler, e as duas rotas que montam
 * a lista **precisam** usar a mesma função — tela e arquivo divergentes é pior
 * que não ter arquivo.
 */

import { precosDasCandidatas } from "@/lib/db/candidatas-compra";
import type { Database } from "@/lib/db/client";
import type { EscolhaSalva } from "@/lib/db/escolhas";
import type { Regiao } from "@/lib/dominio/escopo-pokedex";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import {
  dividirListaCompra,
  gerarListaLiga,
  totalDaLista,
  type LinhaListaCompra,
} from "@/lib/dominio/exportacao-lista-compra";

/**
 * Uma escolha do usuário, no formato da lista de compras.
 *
 * **Escolha sem preço conhecido entra como zero no total**, e a tela conta
 * essas à parte. É o caso da carta que sumiu da varredura seguinte: ela
 * continua na lista com o preço da última vez (decisão de 2026-09-17), e
 * quando nem isso existe, inventar um número seria pior que somar zero e
 * dizer quantas ficaram sem.
 *
 * `raridade` não vem gravada na escolha: ela é do nosso catálogo e muda com o
 * sync, então é lida na hora (`listarEscolhas`). A escolha guarda o que
 * identifica a carta, não o que a classifica.
 *
 * O preço vem de `precosDasEscolhas`, na fonte da instalação; sem ele, é o da
 * Liga gravado na escolha.
 */
export function linhaDaEscolha(
  e: EscolhaSalva,
  preco: PrecoDaEscolha = { preco: e.preco, em: e.precoEm, fonte: "liga" },
): LinhaListaCompra {
  return {
    chave: e.chave,
    especie: e.especie,
    nome: e.nome,
    edicaoNome: e.edicaoNome,
    edicaoSigla: e.edicaoSigla,
    numero: e.numero,
    total: e.total,
    preco: preco.preco ?? 0,
    fontePreco: preco.fonte,
    raridade: e.raridade,
    noCatalogo: e.cartaId !== null,
    caminho: e.caminho,
  };
}

/** O preço de uma escolha na fonte ativa, e quando ele foi visto. */
export interface PrecoDaEscolha {
  preco: number | null;
  em: Date | null;
  fonte: FontePreco;
}

/**
 * O preço de cada escolha **na fonte de preço da instalação**, e nunca nas
 * duas ao mesmo tempo.
 *
 * - `liga`: o que a escolha guarda — o menor preço da Liga na última
 *   varredura que a viu.
 * - `cardmarket`: o valor de referência da candidata, pela carta
 *   (`carta_id`), em `preco_candidata_cardmarket`. O preço da Liga gravado
 *   numa escolha antiga fica de fora: somá-lo com valores do Cardmarket
 *   misturaria duas réguas num total só. Escolha fora do catálogo não tem
 *   carta para consultar e sai sem preço.
 *
 * A tela e a exportação chamam esta mesma função, para não divergirem.
 */
export async function precosDasEscolhas(
  db: Database,
  escolhas: readonly EscolhaSalva[],
  fonte: FontePreco,
): Promise<(e: EscolhaSalva) => PrecoDaEscolha> {
  if (fonte === "liga") return (e) => ({ preco: e.preco, em: e.precoEm, fonte });
  const precos = await precosDasCandidatas(
    db,
    escolhas.flatMap((e) => (e.cartaId === null ? [] : [e.cartaId])),
  );
  return (e) => {
    const p = e.cartaId === null ? undefined : precos.get(e.cartaId);
    return { preco: p?.valor ?? null, em: p?.valor == null ? null : p.precoEm, fonte };
  };
}

/** Uma aba do bloco para colar, como a tela a recebe. */
export interface AbaLigaDTO {
  id: string;
  regiao: Regiao | null;
  /** Set da aba, numa coleção que junta sets; nulo nas outras. */
  setId: string | null;
  /** Nome do set da aba, para o rótulo. Nulo quando `setId` é nulo. */
  setNome: string | null;
  parte: number;
  partes: number;
  /** O texto que o botão Copiar leva — só desta aba. */
  texto: string;
  quantidade: number;
  total: number;
}

/**
 * A lista de compras em abas que cabem na Compra por Lista deles. A divisão
 * vive em `dividirListaCompra`, e a exportação usa a mesma função: o `id` da
 * aba que a tela mostra é o que a URL de download pede.
 */
export function abasDaLista(
  linhas: readonly LinhaListaCompra[],
  tipo: "pokedex" | "set",
  ordemSets: readonly string[] = [],
  nomesSets: ReadonlyMap<string, string> = new Map(),
): AbaLigaDTO[] {
  return dividirListaCompra(linhas, tipo, undefined, ordemSets).map((aba) => ({
    id: aba.id,
    regiao: aba.regiao,
    setId: aba.setId,
    setNome: aba.setId === null ? null : (nomesSets.get(aba.setId) ?? aba.setId),
    parte: aba.parte,
    partes: aba.partes,
    texto: gerarListaLiga(aba.linhas),
    quantidade: aba.linhas.length,
    total: totalDaLista(aba.linhas),
  }));
}
