/**
 * Agrupamento por série + rótulo do seletor de expansão.
 *
 * Volta ao agrupamento por série ("Megaevolução", "Escarlate e Violeta",
 * ...) que existia antes de a ordenação por data entrar, sem abrir mão
 * dela: o pedido foi "dá pra fazer as duas coisas". Série
 * ordenada pela data do set mais recente dela; dentro da série, sets do
 * mais recente pro mais antigo. Set sem `setLancamento` vai pro fim do
 * seu grupo (e a série só cai pro fim se nenhum set dela tiver data) —
 * nunca desaparece, nunca inventa data.
 *
 * **Agrupa por `setSerieId`, não por `setSerie` (nome).** O nome vem
 * traduzido conforme a linha de catálogo disponível — set sem linha em
 * pt é resolvido pela linha em en e o nome da série vem em inglês,
 * duplicando o grupo ("Espada e Escudo" e "Sword & Shield" como séries
 * diferentes, quando são a mesma). `set_serie_id` é estável e não
 * traduz: preenchido em 100% do catálogo desde 2026-08-26. O rótulo
 * exibido continua sendo o nome, só que escolhido pela melhor tradução
 * disponível ENTRE os sets do grupo (pt > en > jp — mesma prioridade de
 * `resolverIdiomaCatalogoDoSet`), não mais pela tradução de um set
 * isolado.
 *
 * **Comparação de id sensível a caixa, sempre — nunca normalizar.** O
 * catálogo japonês usa siglas maiúsculas (`SM`, `S`, `SV`, `XY`) e o
 * ocidental usa minúsculas (`sm`, `swsh`, `sv`, `xy`) para séries que
 * são universos distintos (sets próprios, nomes próprios em japonês).
 * Fundir por normalização de caixa juntaria séries que não são a mesma
 * coisa — decisão deliberada, não esquecimento.
 *
 * Módulo puro, sem I/O — testável sem banco. Ordenação e agrupamento são
 * regra de negócio, não enfeite de componente (AGENTS.md).
 */

import { IDIOMAS, type Idioma } from "./enums";
import { resolverIdiomaCatalogoDoSet, type IdiomaCatalogo } from "./idioma-catalogo";
import { resolverUniversoVagasSet } from "./numeracao-oficial-set";

export interface SetAgrupavel {
  setId: string;
  setNome: string;
  setSerie: string;
  /**
   * Id estável da série (`carta_catalogo.set_serie_id`) — chave real do
   * agrupamento. Sensível a caixa, nunca normalizado (ver cabeçalho do
   * módulo). `null` quando o catálogo não tem o id para este set (não
   * deveria acontecer hoje — 100% das linhas preenchidas — mas o schema
   * permite): esse set cai num grupo próprio, nunca some e nunca funde
   * com outro por coincidência de nome.
   */
  setSerieId: string | null;
  /** Idioma em que `setNome`/`setSerie` desta linha foram resolvidos (mesma resolução de `listarSetsParaCadastro`, pt > en > jp). Alimenta o rótulo do grupo. */
  idiomaCatalogo: IdiomaCatalogo;
  setLancamento: string | null;
}

export interface GrupoDeSeries<T extends SetAgrupavel> {
  /** Chave estável do grupo — use como `key` de lista/React; nunca é o texto exibido (pode colidir entre grupos distintos, ex.: "XY" ocidental e "XY" japonês). */
  serieId: string;
  /** Rótulo de exibição: nome da série na melhor tradução disponível entre os sets do grupo (pt > en > jp). */
  serie: string;
  sets: T[];
}

/** Mais recente primeiro; `null` (sem data) sempre por último. */
function compararLancamento(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/** Data de referência da série: a do set mais recente dela; `null` se nenhum set da série tiver data. */
function lancamentoMaisRecenteDaSerie<T extends SetAgrupavel>(sets: readonly T[]): string | null {
  let maisRecente: string | null = null;
  for (const s of sets) {
    if (s.setLancamento !== null && (maisRecente === null || s.setLancamento > maisRecente)) {
      maisRecente = s.setLancamento;
    }
  }
  return maisRecente;
}

/**
 * Chave interna de agrupamento. Prefixada (`id:`/`nome:`) para os dois
 * espaços de chave nunca colidirem entre si por coincidência de texto.
 * `setSerieId` sensível a caixa — nunca normalizar (ver cabeçalho do
 * módulo). Fallback por nome só cobre o caso hoje inexistente de
 * `setSerieId` nulo, pra o set não sumir da lista.
 */
function chaveDeAgrupamento(s: SetAgrupavel): string {
  return s.setSerieId !== null ? `id:${s.setSerieId}` : `nome:${s.setSerie}`;
}

/**
 * Rótulo do grupo: nome da série na melhor tradução disponível entre os
 * sets do grupo — pt > en > jp, reaproveitando `resolverIdiomaCatalogoDoSet`
 * (mesma prioridade usada em todo o resto do sistema). Precisa olhar o
 * grupo inteiro, não um set isolado: é comum um set do grupo ter sido
 * resolvido em pt e outro (do mesmo `setSerieId`) só existir em en no
 * catálogo — o grupo deve mostrar pt de qualquer forma.
 */
function rotularGrupo<T extends SetAgrupavel>(setsDoGrupo: readonly T[]): string {
  const idiomaEscolhido = resolverIdiomaCatalogoDoSet(setsDoGrupo.map((s) => s.idiomaCatalogo));
  const representante = setsDoGrupo.find((s) => s.idiomaCatalogo === idiomaEscolhido) ?? setsDoGrupo[0];
  return representante.setSerie;
}

/**
 * Agrupa por `setSerieId` (fallback por `setSerie` só se o id vier nulo)
 * e ordena: séries da mais recente pra mais antiga (pela data do set
 * mais recente de cada uma), sets dentro da série na mesma lógica. Não
 * depende da lista de entrada já vir ordenada.
 */
/**
 * Acrescenta o idioma ao rótulo quando dois grupos diferentes exibiriam o
 * mesmo texto. Só age na colisão: no caso comum o rótulo fica limpo.
 */
function desambiguarRotulo<T extends SetAgrupavel>(
  rotulo: string,
  setsDoGrupo: readonly T[],
  contagemPorRotulo: ReadonlyMap<string, number>,
): string {
  if ((contagemPorRotulo.get(rotulo) ?? 0) <= 1) return rotulo;
  const idiomas = IDIOMAS.filter((i) =>
    setsDoGrupo.some((s) => s.idiomaCatalogo === i),
  );
  if (idiomas.length === 0) return rotulo;
  return `${rotulo} (${idiomas.map((i) => i.toUpperCase()).join("/")})`;
}

export function agruparSetsPorSerie<T extends SetAgrupavel>(sets: readonly T[]): GrupoDeSeries<T>[] {
  const porChave = new Map<string, T[]>();
  for (const s of sets) {
    const chave = chaveDeAgrupamento(s);
    const grupo = porChave.get(chave);
    if (grupo) grupo.push(s);
    else porChave.set(chave, [s]);
  }

  // Rótulo pode repetir entre grupos distintos: a série `xy` (ocidental,
  // 17 sets) e a `XY` (japonesa, 2 sets) se chamam "XY" as duas. Sem
  // desambiguar, o seletor mostraria dois grupos "XY" e o usuário não
  // saberia qual é qual — a correção da duplicação teria criado uma
  // confusão nova, só que mais silenciosa. Quando o texto colide, o grupo
  // ganha o idioma entre parênteses.
  const contagemPorRotulo = new Map<string, number>();
  for (const setsDaSerie of porChave.values()) {
    const rotulo = rotularGrupo(setsDaSerie);
    contagemPorRotulo.set(rotulo, (contagemPorRotulo.get(rotulo) ?? 0) + 1);
  }

  const grupos: GrupoDeSeries<T>[] = Array.from(porChave.entries()).map(([serieId, setsDaSerie]) => ({
    serieId,
    serie: desambiguarRotulo(rotularGrupo(setsDaSerie), setsDaSerie, contagemPorRotulo),
    sets: [...setsDaSerie].sort((a, b) => {
      const porData = compararLancamento(a.setLancamento, b.setLancamento);
      if (porData !== 0) return porData;
      return a.setNome.localeCompare(b.setNome, "pt-BR");
    }),
  }));

  grupos.sort((a, b) => {
    const porData = compararLancamento(
      lancamentoMaisRecenteDaSerie(a.sets),
      lancamentoMaisRecenteDaSerie(b.sets),
    );
    if (porData !== 0) return porData;
    return a.serie.localeCompare(b.serie, "pt-BR");
  });

  return grupos;
}

/** `YYYY-MM-DD` (formato do banco) → `dd/mm/aaaa`. `null`/inválido → `null` (nunca inventa data). */
export function formatarDataLancamento(lancamento: string | null): string | null {
  if (lancamento === null) return null;
  const partes = lancamento.split("-");
  if (partes.length !== 3) return null;
  const [ano, mes, dia] = partes;
  if (!ano || !mes || !dia) return null;
  return `${dia}/${mes}/${ano}`;
}

export interface SetRotulavel {
  setSigla: string | null;
  /**
   * Id do set. Usado como sigla quando `setSigla` é nulo: no catálogo
   * japonês a sigla nunca vem preenchida (o repositório não traz
   * `abbreviation`) e o id É o que está impresso na carta — "sv2a
   * 002/165". Sem isso o set japonês aparece só com o nome em japonês, e
   * o usuário não tem como reconhecer qual é.
   */
  setId: string;
  setNome: string;
  /** Idiomas em que o CATÁLOGO tem este set (não o idioma físico da cópia). */
  idiomasDisponiveis: readonly Idioma[];
  qtdOficial: number;
  qtdTotal: number;
  /**
   * Quantas cartas desse set (nesse idioma de catálogo) já estão
   * materializadas no catálogo local — precisa pra resolver o universo
   * quando `qtdOficial` vem 0 (achado do coordenador, caso `mep`).
   */
  qtdCartasNoCatalogo: number;
  setLancamento: string | null;
}

/** "PT/EN", "EN" — ordem canônica de `IDIOMAS`, maiúsculo, unido por "/". */
export function formatarIdiomasDisponiveis(idiomas: readonly Idioma[]): string {
  const presentes = new Set(idiomas);
  return IDIOMAS.filter((i) => presentes.has(i))
    .map((i) => i.toUpperCase())
    .join("/");
}

/**
 * Rótulo do `<option>`: sigla, nome, quantidade de cartas, data de
 * lançamento (quando existir) e, por fim, os idiomas em que o catálogo
 * tem o set — marca uniforme que aparece em TODOS os sets (substitui o
 * antigo "(catálogo EN)", que só marcava a ausência de pt). Set sem data
 * não ganha "sem data" nem qualquer marcador — só não mostra o trecho.
 */
export function formatarRotuloSet(set: SetRotulavel): string {
  const prefixoSigla = `${set.setSigla ?? set.setId} — `;
  const data = formatarDataLancamento(set.setLancamento);
  const sufixoData = data ? ` — ${data}` : "";
  const sufixoIdioma = ` — ${formatarIdiomasDisponiveis(set.idiomasDisponiveis)}`;
  // Mesma resolução de universo da criação de coleção (achado do
  // coordenador: `mep` tem qtdOficial=0 e mostrava "0 cartas" no
  // seletor, contradizendo as 88 vagas que a coleção de fato gera).
  // incluirSecretas=false aqui: o seletor lista o set em geral, antes de
  // qualquer escolha de secretas — mesmo "número de cartas" que a
  // coleção nasce tendo por padrão.
  const { vagasEsperadas } = resolverUniversoVagasSet({
    qtdOficial: set.qtdOficial,
    qtdTotal: set.qtdTotal,
    incluirSecretas: false,
    qtdCartasNoCatalogo: set.qtdCartasNoCatalogo,
  });
  return `${prefixoSigla}${set.setNome} — ${vagasEsperadas} cartas${sufixoData}${sufixoIdioma}`;
}
