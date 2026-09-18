/**
 * Formatos de dados trocados entre a API e os componentes de cliente.
 * Deliberadamente separado de `lib/db/consultas.ts` (que importa Drizzle
 * e `postgres`, server-only): componente `"use client"` só importa tipos
 * daqui, nunca do módulo de acesso a banco.
 */

import type { Condicao, Idioma, VarianteCopia } from "./enums";
import type { OrigemImagem } from "./origem-imagem";
import type { AvisoCatalogoIncompleto } from "./catalogo-incompleto";
import type { AvisoSemNumeracaoOficial } from "./numeracao-oficial-set";
import type { EixoMelhoria } from "./melhoria-vaga";
import type { ParametroPokedex, ParametroSet, TipoColecao } from "./parametro-colecao";
import type { ProgressoRegiao } from "./progresso-regiao";
import type { TipoEnergia } from "./tipo-energia";

export interface FlagsVarianteDTO {
  varianteNormalDisponivel: boolean;
  varianteReverseDisponivel: boolean;
  varianteHoloDisponivel: boolean;
  variantePrimeiraEdicaoDisponivel: boolean;
  variantePromoDisponivel: boolean;
}

export interface SetParaCadastroDTO {
  setId: string;
  setNome: string;
  setSerie: string;
  /** Id estável da série (`carta_catalogo.set_serie_id`), sensível a caixa — chave real do agrupamento em `agruparSetsPorSerie`. `null` só no caso hoje inexistente de o catálogo não ter o id. */
  setSerieId: string | null;
  setSigla: string | null;
  setLancamento: string | null;
  idiomaCatalogo: Idioma;
  temPt: boolean;
  /** Todos os idiomas em que o CATÁLOGO tem este set (filtro + rótulo do seletor de expansão). */
  idiomasDisponiveis: Idioma[];
  qtdOficial: number;
  qtdTotal: number;
  /**
   * Quantas cartas desse set (no `idiomaCatalogo` resolvido) já estão
   * materializadas no catálogo local — alimenta `formatarRotuloSet`
   * quando `qtdOficial` vem 0 (achado do coordenador, caso `mep`).
   */
  qtdCartasNoCatalogo: number;
}

export interface CartaParaGradeDTO extends FlagsVarianteDTO {
  /** Nome ocidental da espécie, só em carta com nome japonês. `null` no resto. */
  nomeEspecie: string | null;
  cartaId: string;
  localId: string;
  nome: string;
  categoria: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  /** Unidades já cadastradas desta carta (soma por carta_id, item 3). Informativo, nunca bloqueia. */
  qtdPossuida: number;
}

export interface GradeDoSetDTO {
  setId: string;
  setNome: string;
  idiomaCatalogo: Idioma;
  temPt: boolean;
  cartas: CartaParaGradeDTO[];
}

export interface CartaEncontradaDTO extends FlagsVarianteDTO {
  /** Nome ocidental da espécie, só em carta com nome japonês. `null` no resto. */
  nomeEspecie: string | null;
  cartaId: string;
  idiomaCatalogo: Idioma;
  localId: string;
  nome: string;
  setId: string;
  setNome: string;
  categoria: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  /** Unidades já cadastradas desta carta (soma por carta_id, item 3). Informativo, nunca bloqueia. */
  qtdPossuida: number;
}

export interface CopiaDoInventarioDTO extends FlagsVarianteDTO {
  /** Nome ocidental da espécie, só em carta com nome japonês. `null` no resto. */
  nomeEspecie: string | null;
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: Condicao;
  gradedEmpresa: string | null;
  gradedNota: string | null;
  gradedCertificado: string | null;
  localizacao: string | null;
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
  notas: string | null;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  alocada: boolean;
  /** Onde a cópia está alocada — nulos quando `alocada` é false (item 1). */
  vagaId: string | null;
  vagaChave: string | null;
  colecaoId: string | null;
  colecaoNome: string | null;
}

/** `GET /api/copias/:id/destinos` (item 1 — alocar a partir do inventário). */
export interface DestinoElegivelDaCopiaDTO {
  colecaoId: string;
  colecaoNome: string;
  colecaoTipo: TipoColecao;
  idiomaExigido: Idioma | null;
  /** true = fora do idiomaExigido da coleção; exige confirmação explícita. */
  foraDePadrao: boolean;
  /** Nulo para coleção customizada (nunca tem vaga vazia — a ação é adicionar). */
  vagaId: string | null;
  chave: string | null;
}

// --- Coleções (Fase 2) ---------------------------------------------------

export interface ColecaoListaDTO {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: ParametroPokedex | ParametroSet | null;
  idiomaExigido: Idioma | null;
  notas: string | null;
  criadoEm: string;
  atualizadoEm: string;
  totalVagas: number;
  vagasPreenchidas: number;
  /** Só presente quando o catálogo local não conhece o set inteiro. */
  avisoCatalogoIncompleto?: AvisoCatalogoIncompleto;
  /** Só presente em coleção de set sem numeração oficial no upstream (ex.: `mep`). */
  avisoSemNumeracaoOficial?: AvisoSemNumeracaoOficial;
}

export interface VagaDaColecaoDTO {
  id: string;
  chave: string;
  copiaId: string | null;
  /** Só coleção pokedex. */
  nomeEspecie: string | null;
  /** Ver `VagaDaColecao` em lib/db/consultas.ts para a origem por caso. */
  cartaNome: string | null;
  cartaLocalId: string | null;
  setNome: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  /**
   * Quantas cópias livres do inventário cabem nesta vaga. Zero desabilita
   * o botão "Alocar" — sem isto, 95% dos botões da Pokédex abriam uma
   * lista vazia (medido em 2026-08-29: 240 vagas vazias, 11 com
   * candidata).
   */
  candidatosDisponiveis: number;
  /** Só quando a vaga está preenchida (dados da cópia alocada). */
  variante: VarianteCopia | null;
  idiomaFisico: Idioma | null;
  condicao: Condicao | null;
  /**
   * Tipo que tinge a vaga na grade. Vem da cópia quando preenchida e da
   * carta esperada quando vazia numa coleção de set; `null` em vaga vazia
   * de pokedex (regra 3: vários Pokémon disputam o número, não existe "a"
   * carta esperada) e em Treinador/Energia, que não têm tipo.
   */
  energia: TipoEnergia | null;
}

/**
 * `GET /api/colecoes/:id` — ao contrário de `ColecaoListaDTO` (lista com
 * progresso pré-agregado em SQL), esta forma NÃO traz `totalVagas`/
 * `vagasPreenchidas`: quem lê uma coleção já recebe `vagas` inteiro, e o
 * progresso é `vagas.length` / `vagas.filter(v => v.copiaId).length` —
 * dado duplicado que o servidor não precisa mandar (contrato real da
 * rota, confirmado ao vivo: a resposta não tem essas duas chaves).
 */
export interface ColecaoComVagasDTO {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: ParametroPokedex | ParametroSet | null;
  idiomaExigido: Idioma | null;
  notas: string | null;
  criadoEm: string;
  atualizadoEm: string;
  vagas: VagaDaColecaoDTO[];
  /** Só presente quando o catálogo local não conhece o set inteiro. */
  avisoCatalogoIncompleto?: AvisoCatalogoIncompleto;
  /** Só presente em coleção de set sem numeração oficial no upstream (ex.: `mep`). */
  avisoSemNumeracaoOficial?: AvisoSemNumeracaoOficial;
  /** Só presente em coleção `pokedex` (item 2): progresso por região. */
  progressoPorRegiao?: ProgressoRegiao[];
}

// --- Visão geral do inventário (item 1) -----------------------------------

export interface TotaisInventarioDTO {
  cartasDistintas: number;
  totalUnidades: number;
  unidadesAlocadas: number;
  unidadesLivres: number;
}

export interface DistribuicaoExpansaoDTO {
  setId: string;
  setNome: string;
  unidades: number;
}

export interface DistribuicaoRaridadeDTO {
  raridade: string | null;
  unidades: number;
}

export interface DistribuicaoIdiomaDTO {
  idioma: Idioma;
  unidades: number;
}

export interface DistribuicaoCondicaoDTO {
  condicao: Condicao;
  unidades: number;
}

export interface DistribuicaoVarianteDTO {
  variante: VarianteCopia;
  unidades: number;
}

/**
 * `GET /api/inventario/resumo`. `colecoes` é exatamente o que
 * `listarColecoes` calcula (mesmo formato de `ColecaoListaDTO`) — não
 * recalculado aqui, só reaproveitado.
 */
export interface ResumoInventarioDTO {
  totais: TotaisInventarioDTO;
  distribuicoes: {
    porExpansao: DistribuicaoExpansaoDTO[];
    porRaridade: DistribuicaoRaridadeDTO[];
    porIdioma: DistribuicaoIdiomaDTO[];
    porCondicao: DistribuicaoCondicaoDTO[];
    porVariante: DistribuicaoVarianteDTO[];
  };
  colecoes: ColecaoListaDTO[];
}

// --- Repetidas / o que sobra para troca (item 2) --------------------------

export interface CartaRepetidaIdiomaDTO {
  idioma: Idioma;
  quantidade: number;
  livres: number;
}

export interface CartaRepetidaDTO {
  cartaId: string;
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  raridade: string | null;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  total: number;
  alocadas: number;
  livres: number;
  idiomas: CartaRepetidaIdiomaDTO[];
}

export interface CandidatoVagaDTO {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  /** Idioma FÍSICO da cópia. */
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: Condicao;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  /** true = fora do idiomaExigido da coleção; exige confirmação explícita. */
  foraDePadrao: boolean;
}

// --- Sugestão de melhoria de vaga preenchida (Fase 9) --------------------

/** A cópia que ocupa a vaga hoje — o lado que a sugestão quer substituir. */
export interface CopiaAlocadaNaVagaDTO {
  copiaId: string;
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  raridade: string | null;
  /** Idioma FÍSICO da cópia. */
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
}

/** Cópia livre que supera a alocada, com o eixo que a fez ganhar. */
export interface CandidataMelhoriaDTO {
  id: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  raridade: string | null;
  /** Idioma FÍSICO da cópia. */
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  quantidade: number;
  imagemUrl: string | null;
  /** De onde veio a foto acima — governa o selo de foto emprestada na tela. */
  imagemOrigem: OrigemImagem | null;
  /**
   * Primeiro eixo em que esta candidata supera a alocada. É o que a tela
   * usa para dizer POR QUE a sugestão apareceu — sugestão sem
   * justificativa vira ruído e ele para de olhar.
   */
  eixo: EixoMelhoria;
}

/** `GET /api/colecoes/:id/melhorias`. */
export interface MelhoriaDaVagaDTO {
  vagaId: string;
  chave: string;
  atual: CopiaAlocadaNaVagaDTO;
  /** Da melhor para a pior. Nunca vazia — vaga sem melhoria não entra na lista. */
  candidatas: CandidataMelhoriaDTO[];
}
