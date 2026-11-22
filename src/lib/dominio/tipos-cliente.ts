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
import type { Divisao } from "./divisoes-colecao";
import type { ProgressoRegiao } from "./progresso-regiao";
import type { TipoEnergia } from "./tipo-energia";
import type { RegraTrofeuHome } from "./dex-trofeus";
import type {
  ColecaoExistenteParaGrupo,
  SerieParaGrupo,
  SetFaltante,
} from "./grupos-colecao";
import type { ParametroCustomizadaTema, TemaColecao } from "./tema-colecao";
import type { Sugestao, SugestaoDeSet, SugestaoDeTema, TipoSugestao } from "./sugestoes-colecao";
import type { VagaDaGrade } from "./grade-colecao";
import type {
  AlvoDaOpcao,
  CriterioDaProposta,
  EscolhaDaVagaFalta,
  OpcaoFalta,
  PrecoReferencia,
  VagaFalta,
} from "./falta-colecao";
import type { PrecoDoDetalhe, SerieCurta } from "./detalhe-carta";
import type { FontePreco } from "./fonte-preco";
import type { Regiao } from "./escopo-pokedex";

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
  /** Idioma da ficha que identifica esta carta — decidido carta a carta. */
  idiomaCatalogo: Idioma;
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
  /** Idioma preferido da grade; cada carta traz o seu. */
  idiomaCatalogo: Idioma;
  temPt: boolean;
  /** Cartas cuja ficha veio do outro idioma ocidental, por faltar no preferido. */
  cartasEmOutroIdioma: number;
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
  /** Na customizada: `null`, ou `{ tema }` na coleção temática (`tema-colecao.ts`). */
  parametro: ParametroPokedex | ParametroSet | ParametroCustomizadaTema | null;
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
  /** Grupo da coleção; `null` = "sem grupo". */
  grupoId: string | null;
  /** Posição dentro do grupo (ou de "sem grupo"). A lista já chega ordenada (`ordem-colecoes.ts`). */
  ordem: number;
  /** Só coleção temática de espécie: o nome da espécie, para rotular o tema. */
  temaRotulo?: string;
}

/**
 * Um grupo de coleções (decisão de 2026-11-22). `serieRotulo` é o nome da
 * série como o seletor de expansão o mostra; o próprio id quando a série
 * saiu do catálogo; `null` sem série.
 */
export interface GrupoColecaoDTO {
  id: string;
  nome: string;
  serieId: string | null;
  serieRotulo: string | null;
  ordem: number;
}

/**
 * `GET /api/colecoes`. `itens` vem na ordem de exibição — grupos pela ordem
 * deles, coleções pela ordem dentro do grupo, "sem grupo" por último —, e
 * `grupos` na ordem dos grupos. As seções saem de `secoesDeColecoes`
 * (`ordem-colecoes.ts`).
 */
export interface ListaColecoesDTO {
  itens: ColecaoListaDTO[];
  grupos: GrupoColecaoDTO[];
}

/** `GET /api/grupos-colecao/series` — as séries ocidentais que um grupo pode ligar, na ordem do seletor. */
export interface SeriesParaGrupoDTO {
  series: SerieParaGrupo[];
}

/** Um set na prévia de "Criar coleções que faltam" (`montarFaltantes`). */
export type SetFaltanteDTO = SetFaltante;

/** `GET /api/grupos-colecao/:id/faltantes` — sets da série em ordem de lançamento. */
export interface FaltantesDoGrupoDTO {
  serieId: string;
  serieRotulo: string;
  sets: SetFaltanteDTO[];
}

/**
 * `POST /api/grupos-colecao/:id/faltantes` — corpo. `serieId` é a série que a
 * prévia mostrava (`FaltantesDoGrupoDTO.serieId`): se o grupo mudou de série
 * desde então, o lote volta 409. `nome` é o editado na prévia.
 */
export interface CriarFaltantesDTO {
  serieId: string;
  sets: { setId: string; nome: string }[];
}

/** `POST /api/grupos-colecao/:id/faltantes` — 201, as coleções na ordem em que entraram no grupo. */
export interface FaltantesCriadasDTO {
  criadas: { id: string; nome: string }[];
}

/** Uma coleção na prévia de "Trazer as que já existem" (`selecionarExistentes`). */
export type ColecaoExistenteParaGrupoDTO = ColecaoExistenteParaGrupo;

/**
 * `GET /api/grupos-colecao/:id/existentes`, na ordem da lista. `serieId` é a
 * série em que a prévia se baseou — volta no corpo do POST (`TrazerExistentesDTO`).
 */
export interface ExistentesDoGrupoDTO {
  serieId: string;
  colecoes: ColecaoExistenteParaGrupoDTO[];
}

/**
 * `POST /api/grupos-colecao/:id/existentes` — corpo (1 a 200 itens).
 * `serieId` é a série do grupo quando a prévia abriu; `grupoOrigemId` é o
 * grupo em que a prévia mostrou cada coleção (`grupoAtual?.id ?? null`). Se a
 * série mudou ou uma coleção já não está nesse grupo, o lote inteiro volta 409
 * `ordemDeColecoesDesatualizada`, e nada é movido.
 */
export interface TrazerExistentesDTO {
  serieId: string;
  itens: { id: string; grupoOrigemId: string | null }[];
}

// --- Sugestões de coleção e coleção temática (2026-11-22) -------------------

/**
 * Uma sugestão de coleção (`montarSugestoes`), discriminada por `tipo`.
 * `chave` é `tipo:valor`.
 *
 * - **set** (`SugestaoDeSet`): `valor`/`setId` é o `set_id`; `rotulo` o nome
 *   do set; `quantidade` de `total` — `total` é a numeração OFICIAL (regra 4),
 *   salvo no set sem numeração oficial (`mep`), em que é o total que a criação
 *   usa no lugar dela e `totalOficial` vem `false` (não chame de "oficial");
 *   só é sugerido set com linha pt/en ativa, o mesmo filtro de `/api/sets`;
 *   `vagasMaterializaveis` só aparece quando o catálogo local tem menos vagas
 *   que isso; `nomeSugerido` é o nome da criação (`AAAA - SIGLA - Nome`).
 * - **tema** (`SugestaoDeTema`): `valor` é a chave canônica — rótulo pela tela:
 *   espécie → `rotulo` (nome do catálogo; ausente, mostre `#valor`); tipo →
 *   `tiposPokemon.<valor>`; raridade → `raridadesCarta.<valor>` (a raridade da
 *   linha en); forma → `temaColecao.formas.<valor>`; ilustrador como está.
 *   Sem entrada no catálogo de mensagens, o valor como está. **Tema não traz
 *   `nomeSugerido`** (o tipo o declara `never`): o nome padrão de uma coleção
 *   temática a tela monta no idioma da interface.
 */
export type SugestaoDTO = Sugestao;
export type SugestaoDeSetDTO = SugestaoDeSet;
export type SugestaoDeTemaDTO = SugestaoDeTema;

/**
 * `GET /api/sugestoes` — todas, já na ordem; a tela mostra as
 * `MAXIMO_SUGESTOES_VISIVEIS` primeiras e "Ver todas" o resto.
 */
export interface ListaSugestoesDTO {
  sugestoes: SugestaoDTO[];
}

/** `POST /api/sugestoes/dispensar` — corpo. 200 `{ ok: true }`, também quando já estava dispensada. */
export interface DispensarSugestaoDTO {
  tipo: TipoSugestao;
  valor: string;
}

/** Uma cópia livre que cabe no tema (`lib/db/cartas-do-tema.ts`). */
export interface CartaDoTemaDTO {
  copiaId: string;
  cartaId: string;
  idiomaCatalogo: Idioma;
  /** Idioma FÍSICO da cópia. */
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  /** Unidades no lote; alocar tira uma. */
  quantidade: number;
  cartaNome: string;
  cartaLocalId: string;
  setId: string;
  setNome: string;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  /** Fora do `idiomaExigido` da coleção: só aloca com `permitirForaDePadrao`. Nunca vem marcada. */
  foraDePadrao: boolean;
  /** A coleção já tem esta carta (outra cópia). Nunca vem marcada. */
  jaNaColecao: boolean;
  /** Uma por carta física — a lista vem com estas marcadas (`marcarUmaPorCarta`). */
  marcadaPorPadrao: boolean;
}

/**
 * `GET /api/colecoes/:id/cartas-do-tema` — só lê. `cartasNovas` é o "N cartas
 * novas cabem neste tema": cartas físicas distintas que a coleção ainda não
 * tem. 400 `colecaoSemTema` em coleção que não é temática.
 */
export interface CartasDoTemaDTO {
  tema: TemaColecao;
  /** Só tema de espécie: o nome da espécie. */
  temaRotulo?: string;
  cartasNovas: number;
  cartas: CartaDoTemaDTO[];
}

/**
 * `POST /api/colecoes/:id/cartas-do-tema` — corpo: 1 a 500 itens, sem cópia
 * repetida. **Cada item devolve o que a prévia mostrou** da cópia
 * (`CartaDoTemaDTO.quantidade` e `.jaNaColecao`): sob a trava, um lote com
 * outra quantidade (outra aba alocou dele) ou uma carta que entrou na coleção
 * desde a prévia recusa o pedido inteiro com 409 `cartasDoTemaDesatualizadas`
 * — releia a lista. Cópia alocada em outra aba é 409 `copiaJaAlocada`. Tudo ou
 * nada. O formato antigo (`copiaIds`) é recusado: 400
 * `pedidoDeCartasDoTemaInvalido`.
 */
export interface AlocarCartasDoTemaDTO {
  itens: { copiaId: string; quantidade: number; jaNaColecao: boolean }[];
  permitirForaDePadrao?: boolean;
}

/** `POST /api/colecoes/:id/cartas-do-tema` — 201, uma vaga por cópia, na ordem do pedido. */
export interface CartasDoTemaAlocadasDTO {
  vagas: { copiaId: string; vagaId: string; chave: string }[];
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
  /** Id da divisão em que a vaga conta; `null` em customizada. */
  divisao: string | null;
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
  /** Na customizada: `null`, ou `{ tema }` na coleção temática (`tema-colecao.ts`). */
  parametro: ParametroPokedex | ParametroSet | ParametroCustomizadaTema | null;
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
  /** Regiões (Pokédex) ou sets e suas partes (set); vazia em customizada. */
  divisoes: Divisao[];
  /** As vagas pedem cartas de mais de um set — a tela mostra o set de cada uma. */
  multiplosSets: boolean;
  /** Só coleção temática de espécie: o nome da espécie, para rotular o tema. */
  temaRotulo?: string;
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

/** Coleção na visão geral: o progresso da lista, mais divisões, capa e logo. */
export interface ColecaoVitrineDTO extends ColecaoListaDTO {
  divisoes: Divisao[];
  capa: { nome: string; imagemUrl: string } | null;
  /** Logo do primeiro set da receita, em ordem de idioma (tenta o seguinte se falhar). */
  logos: string[];
}

export interface CartaVitrineDTO {
  cartaId: string;
  idioma: Idioma;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  imagemUrl: string;
  /**
   * O valor guardado na fonte de preço ativa, em BRL: na Liga, o preço médio
   * (senão o mínimo); no Cardmarket, a tendência convertida pela PTAX (senão
   * a média). `null` até a carta ser consultada.
   */
  preco: number | null;
}

export interface QuaseLaDTO {
  colecaoId: string;
  colecaoNome: string;
  tipo: TipoColecao;
  divisao: Divisao;
  faltam: number;
  faltantes: { chave: string; nome: string | null; imagemUrl: string | null }[];
}

/**
 * `GET /api/inventario/resumo`. `colecoes` é `listarColecoes` sem
 * recálculo, mais o que a vitrine acrescenta (`listarColecoesNaVitrine`).
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
  colecoes: ColecaoVitrineDTO[];
  joias: CartaVitrineDTO[];
  quaseLa: QuaseLaDTO[];
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
   * justificativa vira ruído e o usuário para de olhar.
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

/** Uma vaga da Living Dex, como a grade da Pokédex recebe (`dex_forma` ativa). */
export interface FormaDexDTO {
  id: string;
  numero: number;
  especie: string;
  forma: string | null;
  /** Nome oficial da forma em português; nulo quando não há (a tela mostra o inglês). */
  formaPt: string | null;
  categoria: "base" | "regional" | "genero" | "cosmetica" | "especial";
  geracao: number;
  lendario: boolean;
  mitico: boolean;
  shinyObtenivel: boolean;
  sprite: string;
  /** Ordem do catálogo: número nacional; na espécie, a base, a fêmea e as formas. */
  ordem: number;
  /** Ordinal de lançamento da forma (`dex_forma.lancamento`): ordena os grupos das caixas do HOME. */
  lancamento: number;
}

/** Um jogo que o usuário tem (`dex_jogo_possuido`), com o catálogo resolvido. */
export interface JogoPossuidoDTO {
  id: string;
  jogoId: string;
  nome: string;
  conexaoHome: "ida_e_volta" | "so_envio";
  desde: string | null;
  notas: string | null;
  ativo: boolean;
  /** Registros que estão neste jogo agora. */
  registrosAqui: number;
}

/**
 * Um registro da Living Dex: um Pokémon. A vaga (nome, sprite) a tela
 * resolve pelo catálogo que já tem em mãos.
 */
export interface RegistroDexDTO {
  id: string;
  formaId: string;
  shiny: boolean;
  jogoOrigem: string;
  local: string;
  capturadoEm: string | null;
  notas: string | null;
  /** Chegou ao HOME e ainda não foi levado para a caixa dele (Recebidos, D9). */
  aGuardar: boolean;
  /** Última mudança (cadastro, envio ao HOME, correção), ISO: ordena "os últimos que chegaram". */
  atualizadoEm: string;
}

/** Um troféu de um jogo (`dex_trofeu`), com a conquista do usuário, se houver. */
export interface TrofeuDexDTO {
  id: string;
  jogoId: string;
  tipo: "checkpoint" | "marco" | "calculado";
  nivel: "bronze" | "prata" | "ouro";
  ordem: number;
  textos: Record<"pt-BR" | "en", { titulo: string; descricao: string }>;
  requer: string[];
  /** Números nacionais que o checkpoint destrava. */
  libera: number[];
  /** O que o troféu calculado (do HOME) pede; nulo nos outros. */
  regra: RegraTrofeuHome | null;
  /**
   * A conquista. No troféu calculado é derivada dos registros
   * (`comTrofeusDoHome`): sem data, com `origem: "calculado"`.
   */
  obtido: { em: string | null; origem: "sessao" | "manual" | "calculado"; notas: string | null } | null;
}

/** Uma etapa do checklist de uma tarefa (`lib/dominio/dex-etapas.ts`). */
export interface EtapaDexDTO {
  id: string;
  ordem: number;
  texto: string;
  detalhe: string | null;
  feita: boolean;
  feitaEm: string | null;
}

export interface TarefaDexDTO {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: "captura" | "evolucao" | "troca" | "progresso" | "transferencia" | "outro";
  jogoId: string | null;
  formaIds: string[];
  trofeuId: string | null;
  status: "aberta" | "feita" | "descartada";
  concluidaEm: string | null;
  /** Em ordem; vazia quando a tarefa não tem checklist. */
  etapas: EtapaDexDTO[];
}

export interface PlanoDexDTO {
  id: string;
  titulo: string;
  objetivo: string | null;
  inicio: string;
  fim: string | null;
  status: "ativo" | "concluido" | "encerrado";
  origem: "sessao" | "manual";
  trofeuIds: string[];
  tarefas: TarefaDexDTO[];
}

// --- Página inicial -------------------------------------------------------
/*
 * O resumo das duas visões gerais que a página inicial (`/`) mostra. Formas
 * compactas de propósito: a página é aberta no celular, e a `/dex` manda ao
 * navegador o catálogo inteiro e todos os registros. Aqui o servidor já
 * calculou tudo (`lib/dominio/resumo-inicio.ts`) e só os números da tela
 * viajam. Um campo novo aqui é payload a mais em toda abertura do app.
 */

export interface ColecaoInicioDTO {
  id: string;
  nome: string;
  tipo: TipoColecao;
  vagasPreenchidas: number;
  totalVagas: number;
}

export interface QuaseLaInicioDTO {
  colecaoId: string;
  colecaoNome: string;
  divisao: Divisao;
  faltam: number;
  /**
   * As primeiras vagas que faltam (até 4), decorativas: a URL já resolvida
   * no servidor (sprite na Pokédex, carta esperada no set), `null` sem
   * imagem; `rotulo` é o número da vaga, escrito no lugar da imagem.
   */
  miniaturas: { url: string | null; rotulo: string }[];
}

export interface TotaisInicioDTO {
  cartasDistintas: number;
  totalUnidades: number;
}

export interface ResumoDexInicioDTO {
  /** Vista principal, como o número grande da `/dex`. */
  progresso: Record<"normal" | "shiny", { noHome: number; contam: number }>;
  /** Registros "a guardar" no HOME, como a tela Recebidos. */
  recebidos: number;
  /** Vagas que um Pokémon que já está num jogo preencheria no HOME. */
  levarAoHome: number;
  /** Nenhum jogo marcado como possuído. */
  semJogos: boolean;
  estante: { platina: number; ouro: number; prata: number; bronze: number };
  proximoTrofeu: { titulo: string; nivel: "bronze" | "prata" | "ouro"; feito: number; alvo: number } | null;
  /** O HOME tem troféus e todos estão conquistados. Nunca deduzido de `proximoTrofeu` nulo. */
  todosDoHome: boolean;
  /** Até 2 planos ativos, cada um com até 2 tarefas abertas. */
  planos: {
    id: string;
    titulo: string;
    /** Tarefas fechadas (feitas e descartadas) e o total, como na `/dex`. */
    feitas: number;
    total: number;
    tarefas: { id: string; titulo: string; jogoNome: string | null; etapasFeitas: number; etapasTotal: number }[];
    /** Tarefas abertas além das mostradas. */
    abertasAlem: number;
  }[];
  /** Planos ativos além dos mostrados. */
  planosAlem: number;
}

// --- Design v2: leituras da coleção e do detalhe de carta (pacote 1a) -----
/*
 * As formas das leituras novas da v2. Bloco próprio, para não conflitar com
 * os outros pacotes que mexem neste arquivo. Os tipos de cada vaga, opção e
 * preço são os dos módulos puros que montam a resposta (`grade-colecao.ts`,
 * `falta-colecao.ts`, `detalhe-carta.ts`) — reexportados aqui, e não
 * copiados, para que a resposta e o tipo nunca divirjam. O contrato está em
 * `docs/design-v2/data-contract.md`.
 */

export type VagaGradeV2DTO = VagaDaGrade;
export type OpcaoFaltaV2DTO = OpcaoFalta;
export type AlvoDaOpcaoV2DTO = AlvoDaOpcao;
export type PrecoReferenciaV2DTO = PrecoReferencia;
export type CriterioDaPropostaV2DTO = CriterioDaProposta;
export type EscolhaDaVagaFaltaV2DTO = EscolhaDaVagaFalta;
export type VagaFaltaV2DTO = VagaFalta;
export type PrecoDoDetalheV2DTO = PrecoDoDetalhe;
export type SerieCurtaV2DTO = SerieCurta;

/** `GET /api/colecoes/:id/grade` — a coleção, sem `vagas` de `ColecaoComVagasDTO`, e a grade. */
export interface GradeColecaoV2DTO extends Omit<ColecaoComVagasDTO, "vagas"> {
  totalVagas: number;
  vagasPreenchidas: number;
  vagas: VagaGradeV2DTO[];
}

/** Uma aba da lista para colar na Compra por Lista da Liga (até 110 cartas). */
export interface AbaListaLigaV2DTO {
  id: string;
  regiao: Regiao | null;
  setId: string | null;
  setNome: string | null;
  parte: number;
  partes: number;
  /** O texto que "Copiar" leva — só desta aba. */
  texto: string;
  quantidade: number;
  total: number;
}

/** A lista para colar, como a tela de opções a recebe (`resumoDaListaDeCompra`). */
export interface ListaDeCompraV2DTO {
  fonte: FontePreco;
  selecionadas: number;
  guardadas: number;
  abasLiga: AbaListaLigaV2DTO[];
  multiplas: { chave: string; rotulo: string; quantidade: number }[];
  total: number;
  semPreco: number;
  precoMaisAntigo: string | null;
}

/** O estado das fontes de preço da coleção (o que a tela diz ao lado de "buscar preços"). */
export type EstadoPrecosFaltaV2DTO =
  | {
      fonte: "cardmarket";
      precosCandidatas: {
        cartas: number;
        comPreco: number;
        semPrecoNoCardmarket: number;
        aBuscar: number;
        validadeDias: number;
      };
      rodada: { id: string; criadoEm: string; concluidaEm: string | null; erro: string | null } | null;
    }
  | {
      fonte: "liga";
      varredura: { id: string; criadoEm: string; concluidaEm: string | null; erro: string | null } | null;
    };

/** `GET /api/colecoes/:id/falta`. Customizada: `vagas` vazio, `criterio`, `estado` e `lista` nulos. */
export interface FaltaColecaoV2DTO {
  colecaoId: string;
  tipo: TipoColecao;
  fonte: FontePreco;
  /** Nulo na fonte Liga sem varredura, e na customizada. */
  criterio: CriterioDaPropostaV2DTO | null;
  estado: EstadoPrecosFaltaV2DTO | null;
  vagas: VagaFaltaV2DTO[];
  lista: ListaDeCompraV2DTO | null;
}

/** `GET /api/colecoes/:id/falta/alternativas?chave=`. */
export interface AlternativasDaVagaV2DTO {
  vagaId: string;
  chave: string;
  criterio: CriterioDaPropostaV2DTO | null;
  opcoes: OpcaoFaltaV2DTO[];
  descartadas: number;
  semEstoque: number;
}

/** Uma cópia do usuário no detalhe de carta, com onde está alocada. */
export interface CopiaDoDetalheV2DTO {
  id: string;
  idiomaCatalogo: Idioma;
  /** Idioma físico (regra 7). */
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
  /** Quando a linha foi cadastrada — não a chegada da unidade (divisão e fusão não a preservam). */
  criadoEm: string;
  alocacao: {
    vagaId: string;
    chave: string;
    numero: string;
    colecaoId: string;
    colecaoNome: string;
    colecaoTipo: TipoColecao;
    desde: string;
  } | null;
}

/** `GET /api/cartas/:cartaId/detalhe`. */
export interface DetalheCartaV2DTO {
  carta: FlagsVarianteDTO & {
    cartaId: string;
    idioma: Idioma;
    idiomas: Idioma[];
    nome: string;
    setId: string;
    setNome: string;
    setSigla: string | null;
    setQtdOficial: number | null;
    localId: string;
    raridade: string | null;
    tipos: string[];
    ilustrador: string | null;
    dexIds: number[];
    ativa: boolean;
    imagemUrl: string | null;
    imagemAlta: string | null;
    imagemOrigem: OrigemImagem | null;
  };
  especial: boolean;
  copias: CopiaDoDetalheV2DTO[];
  preco: PrecoDoDetalheV2DTO;
  serie: SerieCurtaV2DTO | null;
  contexto: {
    vaga: {
      id: string;
      chave: string;
      numero: string;
      copiaId: string | null;
      colecaoId: string;
      colecaoNome: string;
      colecaoTipo: TipoColecao;
    } | null;
    copiaId: string | null;
  };
}
