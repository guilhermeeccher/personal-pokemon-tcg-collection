/**
 * A ponte entre a triagem gravada (`escolha_compra`) e a lista de compras que
 * a tela mostra e a exportação baixa.
 *
 * Existe como módulo próprio, e não dentro de um `route.ts`, por dois motivos:
 * o App Router recusa export que não seja handler, e as duas rotas que montam
 * a lista **precisam** usar a mesma função — tela e arquivo divergentes é pior
 * que não ter arquivo.
 */

import type { EscolhaSalva } from "@/lib/db/escolhas";
import type { Regiao } from "@/lib/dominio/escopo-pokedex";
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
 */
export function linhaDaEscolha(e: EscolhaSalva): LinhaListaCompra {
  return {
    chave: e.chave,
    especie: e.especie,
    nome: e.nome,
    edicaoNome: e.edicaoNome,
    edicaoSigla: e.edicaoSigla,
    numero: e.numero,
    total: e.total,
    preco: e.preco ?? 0,
    raridade: e.raridade,
    noCatalogo: e.cartaId !== null,
    caminho: e.caminho,
  };
}

/** Uma aba do bloco para colar, como a tela a recebe. */
export interface AbaLigaDTO {
  id: string;
  regiao: Regiao | null;
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
): AbaLigaDTO[] {
  return dividirListaCompra(linhas, tipo).map((aba) => ({
    id: aba.id,
    regiao: aba.regiao,
    parte: aba.parte,
    partes: aba.partes,
    texto: gerarListaLiga(aba.linhas),
    quantidade: aba.linhas.length,
    total: totalDaLista(aba.linhas),
  }));
}
