/**
 * "O que falta" de todas as coleções (`/colecoes/falta`, pacote 1e) — o que
 * a tela decide, puro e testado.
 *
 * É a tela da v1 com a mesma regra: toda coleção Pokédex ou de set com vaga
 * vazia, na ordem de `listarColecoes` (a tela nunca reordena, seção
 * "Collection groups and order"), cada uma com as vagas vazias e quantas
 * cópias livres já cabem em cada uma ("dá para alocar agora"). A contagem de
 * livres é a de `obterColecaoComVagas`, a mesma que a grade da v2 publica
 * como `livres` — o servidor decide quem cabe (regras 2 e 3); a tela só lê.
 * Alocar é na coleção, nunca aqui (regra 5): esta tela só aponta.
 */

import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";

export interface VagaFaltaGeral {
  id: string;
  chave: string;
  /** O número que a tela escreve (nunca a chave crua `set/local_id`). */
  numero: string;
  /** A espécie (Pokédex) ou a carta esperada (set); nulo quando o catálogo não a conhece. */
  nome: string | null;
  /** Só no set: a carta esperada. A Pokédex mostra o sprite da espécie (regra 3). */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  /** Cópias livres que já cabem na vaga. */
  livres: number;
}

export interface ColecaoFaltaGeral {
  id: string;
  nome: string;
  tipo: TipoColecao;
  vagas: VagaFaltaGeral[];
}

/** As coleções que entram: Pokédex e set com alguma vaga vazia (a customizada nasce cheia). */
export function entraNaFalta(c: { tipo: TipoColecao; totalVagas: number; vagasPreenchidas: number }): boolean {
  return c.tipo !== "customizada" && c.vagasPreenchidas < c.totalVagas;
}

/** As vagas vazias de uma coleção, na ordem dela, no formato da tela. */
export function vagasVazias(
  vagas: readonly {
    id: string;
    chave: string;
    copiaId: string | null;
    cartaNome: string | null;
    nomeEspecie: string | null;
    imagemUrl: string | null;
    imagemOrigem: OrigemImagem | null;
    candidatosDisponiveis: number;
  }[],
): VagaFaltaGeral[] {
  return vagas
    .filter((v) => v.copiaId === null)
    .map((v) => ({
      id: v.id,
      chave: v.chave,
      numero: rotuloChaveVaga(v.chave),
      nome: v.cartaNome ?? v.nomeEspecie,
      imagemUrl: v.imagemUrl,
      imagemOrigem: v.imagemOrigem,
      livres: v.candidatosDisponiveis,
    }));
}

export interface GrupoNaTela {
  colecao: ColecaoFaltaGeral;
  /** As vagas que o filtro deixa ver. */
  exibidas: VagaFaltaGeral[];
  /** Quantas vagas da coleção já dá para alocar (com ou sem filtro). */
  alocaveis: number;
}

/**
 * O que a tela desenha: os totais (de todas as coleções, com ou sem filtro,
 * como a v1) e, por coleção, as vagas que o filtro "só o que dá para alocar"
 * deixa — uma coleção sem nenhuma some com o filtro ligado.
 */
export function montarFaltaGeral(
  colecoes: readonly ColecaoFaltaGeral[],
  soAlocaveis: boolean,
): { totalVagas: number; totalAlocaveis: number; grupos: GrupoNaTela[] } {
  let totalVagas = 0;
  let totalAlocaveis = 0;
  const grupos: GrupoNaTela[] = [];
  for (const colecao of colecoes) {
    const alocaveis = colecao.vagas.filter((v) => v.livres > 0);
    totalVagas += colecao.vagas.length;
    totalAlocaveis += alocaveis.length;
    const exibidas = soAlocaveis ? alocaveis : colecao.vagas;
    if (exibidas.length > 0) grupos.push({ colecao, exibidas, alocaveis: alocaveis.length });
  }
  return { totalVagas, totalAlocaveis, grupos };
}
