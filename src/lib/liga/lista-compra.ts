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
import type { LinhaListaCompra } from "@/lib/dominio/exportacao-lista-compra";

/**
 * Uma escolha dele, no formato da lista de compras.
 *
 * **Escolha sem preço conhecido entra como zero no total**, e a tela conta
 * essas à parte. É o caso da carta que sumiu da varredura seguinte: ela
 * continua na lista com o preço da última vez (decisão dele em 2026-09-17), e
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
