/**
 * Grupos de coleções (decisão de 2026-11-22): leitura dos corpos das rotas,
 * a ligação com uma série do catálogo e as duas ações de um grupo ligado —
 * "criar as coleções que faltam" e "trazer as que já existem". A ordem da
 * lista mora em `ordem-colecoes.ts`; quem grava é `lib/db/grupos-colecao.ts`.
 *
 * ## Regras
 *
 *  - **Só séries ocidentais.** Um grupo se liga a um `set_serie_id` de set que
 *    o catálogo tem em pt ou en. A série japonesa é outro id (`SM` japonês,
 *    `sm` ocidental) e fica de fora; a comparação é **sensível a caixa,
 *    sempre** — normalizar juntaria universos diferentes (o mesmo cuidado de
 *    `agrupamento-sets.ts`).
 *  - **"Já existe" é pela receita ocidental.** Um set tem coleção quando
 *    alguma coleção de set com catálogo pt ou en o tem em `parametro.sets`;
 *    uma coleção que junta vários sets conta para todos. Não importa em que
 *    grupo ela está, nem o nome. A receita japonesa não conta, nem como "já
 *    existe" nem como candidata a "trazer": `neo1`..`neo4` dividem o `set_id`
 *    com o inglês e são outras cartas (`setsDaReceitaOcidental`).
 *  - **Promo e energia vêm desmarcados, decididos pelo dado**, nunca por uma
 *    lista de ids: promo = sem numeração oficial (`set_qtd_oficial = 0`, como
 *    o `mep`); energia = toda carta ativa do set é Energia (como o `mee`).
 *    Aparecem na prévia, para o usuário marcar se quiser.
 *  - **Nome sugerido `AAAA - SIGLA - Nome`**, que a tela deixa editar antes de
 *    criar. Sem ano, `SIGLA - Nome`; sem sigla, `AAAA - Nome`. Nunca inventa
 *    nenhum dos dois.
 *  - **A coleção criada é a mesma que a tela de nova coleção criaria** para um
 *    set só: `idiomaCatalogo` pt (o pt→en carta a carta já cobre o set sem
 *    tradução), sem secretas, sem idioma exigido (`parametroDaColecaoFaltante`).
 *
 * Problemas de corpo que a tela não emite (campo de tipo errado) saem como
 * `erro`, em português, como no resto das rotas; o que a tela emite de verdade
 * (nome vazio, set repetido, set que já ganhou coleção em outra aba) é recusa
 * com chave.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { agruparSetsPorSerie, type SetAgrupavel } from "./agrupamento-sets";
import type { Idioma } from "./enums";
import type { ParametroSet, TipoColecao } from "./parametro-colecao";
import { recusa, type Recusa } from "./recusa";
import { canonizarUuid, ehUuid } from "./uuid";

export const TAMANHO_MAXIMO_NOME_GRUPO = 80;
/** Teto de coleções criadas por vez — folgado para uma série inteira (a maior tem ~20 sets). */
export const MAXIMO_SETS_POR_CRIACAO = 50;
/** As duas grafias da categoria Energia no catálogo ocidental (pt e en). */
export const CATEGORIAS_ENERGIA: readonly string[] = ["Energia", "Energy"];

export type Leitura<T> =
  | { ok: true; valor: T }
  | { ok: false; recusa: Recusa }
  | { ok: false; erro: string };

// --- Corpo das rotas --------------------------------------------------------

function lerNomeGrupo(v: unknown): Leitura<string> {
  const nome = typeof v === "string" ? v.trim() : "";
  if (nome === "" || nome.length > TAMANHO_MAXIMO_NOME_GRUPO) {
    return {
      ok: false,
      recusa: recusa("nomeDoGrupoInvalido", { maximo: String(TAMANHO_MAXIMO_NOME_GRUPO) }),
    };
  }
  return { ok: true, valor: nome };
}

/** `serieId` do corpo: ausente ou nulo = sem série; texto não vazio = a série (sem mexer na caixa). */
function lerSerieId(v: unknown): Leitura<string | null> {
  if (v === undefined || v === null) return { ok: true, valor: null };
  if (typeof v !== "string" || v.trim() === "") {
    return { ok: false, erro: "serieId inválido (texto ou null)." };
  }
  return { ok: true, valor: v };
}

/**
 * `grupoId` do corpo: `null` = "sem grupo", um UUID = o grupo. Ausente vale
 * `null` só onde o campo é opcional (criar coleção); onde ele diz o destino
 * (reordenar, mover), ausente é corpo malformado.
 */
export function lerGrupoId(v: unknown, opcional: boolean): Leitura<string | null> {
  if (v === undefined && opcional) return { ok: true, valor: null };
  if (v === null) return { ok: true, valor: null };
  // Canonizado: o id é comparado em memória com os que vêm do banco.
  if (typeof v === "string" && ehUuid(v)) return { ok: true, valor: canonizarUuid(v) };
  return { ok: false, erro: "grupoId inválido (UUID ou null)." };
}

export interface CriacaoGrupo {
  nome: string;
  serieId: string | null;
}

export function lerCriacaoGrupo(corpo: unknown): Leitura<CriacaoGrupo> {
  const obj = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const nome = lerNomeGrupo(obj.nome);
  if (!nome.ok) return nome;
  const serieId = lerSerieId(obj.serieId);
  if (!serieId.ok) return serieId;
  return { ok: true, valor: { nome: nome.valor, serieId: serieId.valor } };
}

/** Campos que a edição muda; o que não veio fica como está. `serieId: null` desliga a série. */
export interface EdicaoGrupo {
  nome?: string;
  serieId?: string | null;
}

export function lerEdicaoGrupo(corpo: unknown): Leitura<EdicaoGrupo> {
  const obj = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const edicao: EdicaoGrupo = {};
  if (obj.nome !== undefined) {
    const nome = lerNomeGrupo(obj.nome);
    if (!nome.ok) return nome;
    edicao.nome = nome.valor;
  }
  if (obj.serieId !== undefined) {
    const serieId = lerSerieId(obj.serieId);
    if (!serieId.ok) return serieId;
    edicao.serieId = serieId.valor;
  }
  if (edicao.nome === undefined && edicao.serieId === undefined) {
    return { ok: false, erro: "Nada a editar (nome e/ou serieId)." };
  }
  return { ok: true, valor: edicao };
}

/**
 * `{ ids: string[] }` — os ids de "trazer as que já existem". Pelo menos um,
 * sem repetição, canonizados (`canonizarUuid`) antes de comparar com os do banco.
 */
export function lerIds(corpo: unknown): Leitura<string[]> {
  const ids = (typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>).ids : undefined);
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    return { ok: false, erro: "ids ausente ou vazio (lista de UUIDs)." };
  }
  const canonicos = (ids as string[]).map(canonizarUuid);
  if (new Set(canonicos).size !== canonicos.length) return { ok: false, erro: "ids repetidos." };
  return { ok: true, valor: canonicos };
}

// --- Séries ------------------------------------------------------------------

/** Um set do catálogo como o seletor de expansão o vê (`SetParaCadastro`). */
export interface SetDoCatalogo extends SetAgrupavel {
  setSigla: string | null;
  idiomasDisponiveis: readonly Idioma[];
  qtdOficial: number;
}

/** Set que o catálogo tem em pt ou en. Um set que só existe em jp é do catálogo japonês. */
export function ehSetOcidental(s: Pick<SetDoCatalogo, "idiomasDisponiveis">): boolean {
  return s.idiomasDisponiveis.includes("pt") || s.idiomasDisponiveis.includes("en");
}

export interface SerieParaGrupo {
  /** `set_serie_id`, na caixa do catálogo. */
  serieId: string;
  /** O nome da série como o seletor de expansão o mostra (`agruparSetsPorSerie`). */
  rotulo: string;
  /** Quantos sets ocidentais a série tem. */
  sets: number;
}

/**
 * As séries ocidentais que um grupo pode ligar, na ordem do seletor de
 * expansão (a mais recente primeiro). O rótulo vem do mesmo agrupamento que
 * o seletor usa, aplicado só aos sets ocidentais — como o seletor faz quando
 * o filtro de idioma tira o japonês. Set sem `setSerieId` não forma série
 * ligável: não há id para gravar.
 */
export function seriesOcidentais<T extends SetDoCatalogo>(sets: readonly T[]): SerieParaGrupo[] {
  return agruparSetsPorSerie(sets.filter(ehSetOcidental)).flatMap((g) => {
    const serieId = g.sets[0]?.setSerieId ?? null;
    return serieId === null ? [] : [{ serieId, rotulo: g.serie, sets: g.sets.length }];
  });
}

/** Os sets ocidentais de uma série. Igualdade estrita de `set_serie_id`: `SM` não é `sm`. */
export function setsOcidentaisDaSerie<T extends SetDoCatalogo>(sets: readonly T[], serieId: string): T[] {
  return sets.filter((s) => ehSetOcidental(s) && s.setSerieId === serieId);
}

// --- Criar as que faltam -----------------------------------------------------

export type MotivoDesmarcado = "promo" | "energia";

/**
 * Por que um set vem desmarcado na prévia, decidido pelo dado: promo é o set
 * sem numeração oficial; energia é o set em que toda carta ativa é Energia.
 * `null` quando nada o desmarca.
 */
export function motivoDesmarcado(set: {
  qtdOficial: number;
  cartasAtivas: number;
  cartasEnergia: number;
}): MotivoDesmarcado | null {
  if (set.qtdOficial === 0) return "promo";
  if (set.cartasAtivas > 0 && set.cartasEnergia === set.cartasAtivas) return "energia";
  return null;
}

/** O ano de um `YYYY-MM-DD`; `null` sem data ou fora do formato (nunca inventa). */
function anoDoLancamento(lancamento: string | null): string | null {
  const m = lancamento === null ? null : /^(\d{4})-/.exec(lancamento);
  return m ? m[1] : null;
}

/** `2025 - PFL - Fogo Fantasmagórico`; sem ano, `PFL - ...`; sem sigla, `2025 - ...`. */
export function nomeSugeridoDoSet(set: {
  lancamento: string | null;
  sigla: string | null;
  nome: string;
}): string {
  const sigla = set.sigla?.trim() ? set.sigla.trim() : null;
  return [anoDoLancamento(set.lancamento), sigla, set.nome].filter((p) => p !== null).join(" - ");
}

/** O que a criação em lote grava como parâmetro — o mesmo de "nova coleção" com um set só. */
export function parametroDaColecaoFaltante(setId: string): ParametroSet {
  return { sets: [setId], idiomaCatalogo: "pt", incluirSecretas: false };
}

/** O que "já existe" precisa de uma coleção: o tipo e, se for de set, a receita. */
export interface ColecaoComReceita {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
}

/**
 * Os sets da receita de uma coleção de set **ocidental** (`idiomaCatalogo` pt
 * ou en). A receita japonesa fica de fora de propósito: `neo1` a `neo4` têm o
 * mesmo `set_id` em en e em jp, mas são cartas diferentes, numeradas de outro
 * jeito — uma coleção japonesa de `neo1` não é "a coleção do `neo1`" da série
 * ocidental, nem candidata a entrar no grupo dela.
 */
function setsDaReceitaOcidental(c: ColecaoComReceita): string[] {
  if (c.tipo !== "set") return [];
  const p = c.parametro as Partial<ParametroSet> | null;
  if (p?.idiomaCatalogo !== "pt" && p?.idiomaCatalogo !== "en") return [];
  return Array.isArray(p.sets) ? p.sets.filter((s): s is string => typeof s === "string") : [];
}

/**
 * Cada set com as coleções ocidentais que o têm na receita, na ordem em que as
 * coleções vieram (a da lista). Uma coleção de vários sets aparece em todos.
 */
export function colecoesPorSet(
  colecoes: readonly ColecaoComReceita[],
): Map<string, { id: string; nome: string }[]> {
  const porSet = new Map<string, { id: string; nome: string }[]>();
  for (const c of colecoes) {
    for (const setId of new Set(setsDaReceitaOcidental(c))) {
      const lista = porSet.get(setId);
      const item = { id: c.id, nome: c.nome };
      if (lista) lista.push(item);
      else porSet.set(setId, [item]);
    }
  }
  return porSet;
}

/** Um set da série na prévia de "criar as que faltam". */
export interface SetFaltante {
  setId: string;
  /** Nome do set em pt, senão en. */
  nome: string;
  sigla: string | null;
  lancamento: string | null;
  qtdOficial: number;
  /** Idiomas ocidentais em que o catálogo tem o set. */
  idiomas: ("pt" | "en")[];
  /** Coleções que já têm o set na receita. Com alguma, o set não é selecionável. */
  colecoesExistentes: { id: string; nome: string }[];
  nomeSugerido: string;
  marcadoPorPadrao: boolean;
  motivoDesmarcado: MotivoDesmarcado | null;
}

/** Mais antigo primeiro; sem data por último; depois o id. */
function compararLancamento(
  a: { lancamento: string | null; setId: string },
  b: { lancamento: string | null; setId: string },
): number {
  if (a.lancamento !== b.lancamento) {
    if (a.lancamento === null) return 1;
    if (b.lancamento === null) return -1;
    return a.lancamento < b.lancamento ? -1 : 1;
  }
  return a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0;
}

/**
 * A prévia de "criar as que faltam": cada set ocidental da série, em ordem de
 * lançamento, com as coleções que já o têm, o nome sugerido e se vem marcado.
 * Marcado = sem coleção e sem motivo de desmarcar.
 */
export function montarFaltantes(
  sets: readonly (SetDoCatalogo & { cartasAtivas: number; cartasEnergia: number })[],
  existentes: ReadonlyMap<string, { id: string; nome: string }[]>,
): SetFaltante[] {
  return sets
    .map((s): SetFaltante => {
      const colecoesExistentes = existentes.get(s.setId) ?? [];
      const motivo = motivoDesmarcado(s);
      return {
        setId: s.setId,
        nome: s.setNome,
        sigla: s.setSigla,
        lancamento: s.setLancamento,
        qtdOficial: s.qtdOficial,
        idiomas: s.idiomasDisponiveis.filter((i): i is "pt" | "en" => i === "pt" || i === "en"),
        colecoesExistentes,
        nomeSugerido: nomeSugeridoDoSet({ lancamento: s.setLancamento, sigla: s.setSigla, nome: s.setNome }),
        marcadoPorPadrao: colecoesExistentes.length === 0 && motivo === null,
        motivoDesmarcado: motivo,
      };
    })
    .sort(compararLancamento);
}

export interface PedidoFaltante {
  setId: string;
  nome: string;
}

/** `{ sets: [{ setId, nome }] }`, de 1 a `MAXIMO_SETS_POR_CRIACAO`, sem set repetido e sem nome vazio. */
export function lerPedidoFaltantes(corpo: unknown): Leitura<PedidoFaltante[]> {
  const sets = typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>).sets : undefined;
  if (!Array.isArray(sets)) return { ok: false, erro: "sets ausente (lista de { setId, nome })." };
  if (sets.length === 0 || sets.length > MAXIMO_SETS_POR_CRIACAO) {
    return {
      ok: false,
      recusa: recusa("quantidadeDeSetsParaCriarInvalida", { maximo: String(MAXIMO_SETS_POR_CRIACAO) }),
    };
  }
  const pedido: PedidoFaltante[] = [];
  const vistos = new Set<string>();
  for (const item of sets) {
    const obj = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof obj.setId !== "string" || obj.setId === "") {
      return { ok: false, erro: "setId ausente num item de sets." };
    }
    if (vistos.has(obj.setId)) {
      return { ok: false, recusa: recusa("setRepetidoNoPedido", { setId: obj.setId }) };
    }
    vistos.add(obj.setId);
    const nome = typeof obj.nome === "string" ? obj.nome.trim() : "";
    if (nome === "") return { ok: false, recusa: recusa("nomeDaColecaoVazio", { setId: obj.setId }) };
    pedido.push({ setId: obj.setId, nome });
  }
  return { ok: true, valor: pedido };
}

/**
 * Confere o pedido contra a prévia lida dentro da trava: todo set tem de ser
 * da série (o que já diz que é ocidental) e não pode ter ganhado coleção
 * desde que a tela abriu. Devolve o pedido em ordem de lançamento — a ordem
 * em que as coleções entram no fim do grupo — ou a primeira recusa.
 */
export function conferirPedidoFaltantes(
  pedido: readonly PedidoFaltante[],
  faltantes: readonly SetFaltante[],
): { ok: true; pedido: PedidoFaltante[] } | { ok: false; recusa: Recusa } {
  const porSet = new Map(faltantes.map((f, i) => [f.setId, { f, i }]));
  for (const p of pedido) {
    const achado = porSet.get(p.setId);
    if (!achado) return { ok: false, recusa: recusa("setForaDaSerieDoGrupo", { setId: p.setId }) };
    const existente = achado.f.colecoesExistentes[0];
    if (existente) {
      return { ok: false, recusa: recusa("setJaTemColecao", { setId: p.setId, colecao: existente.nome }) };
    }
  }
  const posicao = (setId: string) => porSet.get(setId)?.i ?? 0;
  return { ok: true, pedido: [...pedido].sort((a, b) => posicao(a.setId) - posicao(b.setId)) };
}

// --- Trazer as que já existem ------------------------------------------------

export interface ColecaoExistenteParaGrupo {
  id: string;
  nome: string;
  grupoAtual: { id: string; nome: string } | null;
  /** Só a que não está em grupo nenhum vem marcada: tirar de outro grupo é escolha do usuário. */
  marcadoPorPadrao: boolean;
}

/**
 * As coleções de set ocidentais que têm pelo menos um set da série na receita
 * e não estão neste grupo, na ordem em que vieram (a da lista).
 */
export function selecionarExistentes(
  colecoes: readonly (ColecaoComReceita & { grupoId: string | null })[],
  setsDaSerie: ReadonlySet<string>,
  grupoId: string,
  nomesDosGrupos: ReadonlyMap<string, string>,
): ColecaoExistenteParaGrupo[] {
  return colecoes
    .filter((c) => c.grupoId !== grupoId && setsDaReceitaOcidental(c).some((s) => setsDaSerie.has(s)))
    .map((c) => {
      const nomeGrupo = c.grupoId === null ? undefined : nomesDosGrupos.get(c.grupoId);
      return {
        id: c.id,
        nome: c.nome,
        grupoAtual: c.grupoId !== null && nomeGrupo !== undefined ? { id: c.grupoId, nome: nomeGrupo } : null,
        marcadoPorPadrao: c.grupoId === null,
      };
    });
}

/**
 * Os ids pedidos, todos entre os candidatos, na ordem dos candidatos (a da
 * lista) — é nela que entram no fim do grupo. Um id fora recusa o pedido
 * inteiro: a tela estava velha, e trazer só uma parte seria adivinhar.
 */
export function conferirPedidoExistentes(
  ids: readonly string[],
  candidatos: readonly { id: string }[],
): { ok: true; ids: string[] } | { ok: false; recusa: Recusa } {
  const pedidos = new Set(ids);
  const conhecidos = new Set(candidatos.map((c) => c.id));
  if (ids.some((id) => !conhecidos.has(id))) {
    return { ok: false, recusa: recusa("colecaoForaDasExistentesDoGrupo") };
  }
  return { ok: true, ids: candidatos.filter((c) => pedidos.has(c.id)).map((c) => c.id) };
}
