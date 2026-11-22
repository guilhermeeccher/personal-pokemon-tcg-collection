/**
 * A grade de uma coleção numa chamada só — a leitura agregada da v2
 * (`GET /api/colecoes/:id/grade`). Módulo puro: recebe o que as consultas
 * leram e monta cada vaga.
 *
 * ## Por que uma leitura agregada
 *
 * A tela da v1 junta três chamadas: a coleção com as vagas
 * (`GET /api/colecoes/:id`), as melhorias (`GET .../melhorias`) e, para
 * saber o que está na lista de compras, o `GET .../opcoes-compra`, que na
 * fonte Cardmarket manda todas as candidatas com foto — 1,3 MB numa Pokédex
 * de Kanto com dados de exemplo (medido em 2026-11-22). A grade da v2 precisa
 * só de um sinal por vaga: a cópia que está nela, a carta que ela espera, se
 * há upgrade, se há cópia livre que serve e quais escolhas de compra a vaga
 * tem. Sem as candidatas, que vêm sob demanda pela leitura do "o que falta".
 *
 * ## Enxuta de propósito
 *
 * Uma Pokédex nacional são 1.025 vagas. Cada campo aqui é um campo vezes
 * mil: a vaga não repete o que a tela deriva (o sprite da vaga vazia de
 * Pokédex sai de `urlSpritePokemon(chave)`, o progresso de `copia !== null`),
 * e a cópia traz só o que a grade desenha — o resto está no detalhe da carta.
 * Campo vazio não viaja (ver `VagaDaGrade`). Medido com dados inventados no
 * formato real (o teste de tamanho, que falha se um campo novo inchar o
 * payload): ~270 KB numa Pokédex nacional e ~100 KB num set de 250 vagas, sem
 * compressão; antes de omitir os vazios, a Pokédex dava ~400 KB.
 *
 * ## As regras que passam por aqui
 *
 * - **Regra 6:** toda vaga vem, vazia ou não, na ordem de exibição.
 * - **Regra 7:** o idioma da cópia é o físico; o da ficha (`carta`) é só a
 *   identificação, e os dois viajam separados.
 * - **Regra 5 e 8:** `upgrade` é um sinal, nunca uma troca; `livres` diz que
 *   há o que alocar, nunca aloca.
 * - **Escolhas de compra** só em vaga vazia: a escolha de uma vaga que foi
 *   preenchida continua guardada no banco e volta quando a cópia sai, mas
 *   não é o que a vaga mostra agora.
 */

import { rotuloChaveVaga } from "./chave-vaga-set";
import type { Condicao, Idioma, VarianteCopia } from "./enums";
import type { EixoMelhoria } from "./melhoria-vaga";
import type { OrigemImagem } from "./origem-imagem";
import type { TipoColecao } from "./parametro-colecao";
import type { TipoEnergia } from "./tipo-energia";

/** O que a grade lê de cada vaga da leitura base (`VagaDaColecao`, em `lib/db/consultas.ts`). */
export interface VagaBaseDaGrade {
  id: string;
  chave: string;
  copiaId: string | null;
  nomeEspecie: string | null;
  cartaNome: string | null;
  cartaLocalId: string | null;
  setNome: string | null;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  candidatosDisponiveis: number;
  variante: VarianteCopia | null;
  idiomaFisico: Idioma | null;
  condicao: Condicao | null;
  energia: TipoEnergia | null;
  divisao: string | null;
}

/** A cópia alocada numa vaga, com o que a leitura base não traz. */
export interface CopiaAlocadaDaGrade {
  vagaId: string;
  copiaId: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  raridade: string | null;
  /** `vaga.atualizado_em`: gravado ao alocar, desalocar e trocar. */
  desde: Date;
}

/** A ficha da carta que uma vaga vazia de set espera (a mesma da imagem e do nome). */
export interface CartaEsperadaDaGrade {
  chave: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  raridade: string | null;
}

export interface EntradaGrade {
  tipo: TipoColecao;
  vagas: readonly VagaBaseDaGrade[];
  copias: readonly CopiaAlocadaDaGrade[];
  esperadas: readonly CartaEsperadaDaGrade[];
  /** `listarMelhoriasDaColecao`: candidatas da melhor para a pior. */
  melhorias: ReadonlyArray<{ vagaId: string; candidatas: ReadonlyArray<{ eixo: EixoMelhoria }> }>;
  /** `listarEscolhas` — todas, inclusive as de vaga preenchida. */
  escolhas: ReadonlyArray<{
    id: string;
    chave: string;
    cartaId: string | null;
    nome: string;
    vagaVazia: boolean;
  }>;
}

/**
 * Uma vaga da grade. **Campo ausente é nulo, zero ou vazio**: numa Pokédex
 * nacional quase toda vaga está vazia, e repetir `"copia":null` mil vezes
 * era um terço do payload (medido no teste de tamanho).
 */
export interface VagaDaGrade {
  id: string;
  chave: string;
  /** O número que a tela escreve: o impresso no set, o nacional na Pokédex, a sequência na customizada. */
  numero: string;
  /** Só Pokédex: o nome da espécie da vaga. */
  especie?: string;
  /** A carta exibida: a da cópia, ou a esperada na vaga vazia de set; ausente na vazia de Pokédex. */
  cartaNome?: string;
  cartaLocalId?: string;
  setNome?: string;
  divisao?: string;
  energia?: TipoEnergia;
  /** A URL crua da foto (`urlImagemCarta` acrescenta o tamanho); ausente na vaga vazia de Pokédex, que usa o sprite. */
  imagemUrl?: string;
  imagemOrigem?: OrigemImagem;
  /** A ficha da carta exibida — o que abre o detalhe. Ausente na vaga vazia de Pokédex (regra 3). */
  carta?: { cartaId: string; idiomaCatalogo: Idioma; raridade: string | null };
  copia?: {
    id: string;
    variante: VarianteCopia;
    /** Idioma físico (regra 7). */
    idioma: Idioma;
    condicao: Condicao;
    /** Quando a cópia entrou na vaga (`vaga.atualizado_em`). */
    desde: string;
  };
  /** Cópias livres que cabem na vaga vazia; ausente quando nenhuma (e sempre na preenchida). */
  livres?: number;
  /** O eixo da melhor cópia livre que supera a alocada; ausente sem upgrade. */
  upgrade?: EixoMelhoria;
  /** Escolhas de compra da vaga vazia; o `id` é o que desmarca (`PATCH .../opcoes-compra/selecao`). */
  escolhas?: { id: string; cartaId: string | null; nome: string }[];
}

/**
 * Monta as vagas na ordem em que a leitura base as entregou.
 *
 * As entradas são lidas numa transação só (REPEATABLE READ): uma vaga
 * preenchida sem a linha da cópia não é um estado possível, é um defeito de
 * leitura, e a função falha em vez de desenhar uma vaga pela metade.
 */
export function montarVagasDaGrade(e: EntradaGrade): VagaDaGrade[] {
  const copiaPorVaga = new Map(e.copias.map((c) => [c.vagaId, c]));
  const esperadaPorChave = new Map(e.esperadas.map((c) => [c.chave, c]));
  const upgradePorVaga = new Map(
    e.melhorias.flatMap((m) => (m.candidatas.length > 0 ? [[m.vagaId, m.candidatas[0].eixo] as const] : [])),
  );
  const escolhasPorChave = new Map<string, VagaDaGrade["escolhas"]>();
  for (const x of e.escolhas) {
    if (!x.vagaVazia) continue;
    const lista = escolhasPorChave.get(x.chave) ?? [];
    lista.push({ id: x.id, cartaId: x.cartaId, nome: x.nome });
    escolhasPorChave.set(x.chave, lista);
  }

  return e.vagas.map((v) => {
    const preenchida = v.copiaId !== null;
    const vagaDaGrade: VagaDaGrade = { id: v.id, chave: v.chave, numero: rotuloChaveVaga(v.chave) };
    if (e.tipo === "pokedex" && v.nomeEspecie !== null) vagaDaGrade.especie = v.nomeEspecie;
    if (v.cartaNome !== null) vagaDaGrade.cartaNome = v.cartaNome;
    if (v.cartaLocalId !== null) vagaDaGrade.cartaLocalId = v.cartaLocalId;
    if (v.setNome !== null) vagaDaGrade.setNome = v.setNome;
    if (v.divisao !== null) vagaDaGrade.divisao = v.divisao;
    if (v.energia !== null) vagaDaGrade.energia = v.energia;
    if (v.imagemUrl !== null) vagaDaGrade.imagemUrl = v.imagemUrl;
    if (v.imagemOrigem !== null) vagaDaGrade.imagemOrigem = v.imagemOrigem;

    if (preenchida) {
      const c = copiaPorVaga.get(v.id);
      if (!c || c.copiaId !== v.copiaId || !v.variante || !v.idiomaFisico || !v.condicao) {
        throw new Error(`grade: a vaga ${v.id} está preenchida, mas a cópia não veio na mesma leitura`);
      }
      vagaDaGrade.carta = { cartaId: c.cartaId, idiomaCatalogo: c.idiomaCatalogo, raridade: c.raridade };
      vagaDaGrade.copia = {
        id: c.copiaId,
        variante: v.variante,
        idioma: v.idiomaFisico,
        condicao: v.condicao,
        desde: c.desde.toISOString(),
      };
      const upgrade = upgradePorVaga.get(v.id);
      if (upgrade) vagaDaGrade.upgrade = upgrade;
      return vagaDaGrade;
    }

    const esperada = e.tipo === "set" ? esperadaPorChave.get(v.chave) : undefined;
    if (esperada) {
      vagaDaGrade.carta = {
        cartaId: esperada.cartaId,
        idiomaCatalogo: esperada.idiomaCatalogo,
        raridade: esperada.raridade,
      };
    }
    if (v.candidatosDisponiveis > 0) vagaDaGrade.livres = v.candidatosDisponiveis;
    const escolhas = escolhasPorChave.get(v.chave);
    if (escolhas) vagaDaGrade.escolhas = escolhas;
    return vagaDaGrade;
  });
}
