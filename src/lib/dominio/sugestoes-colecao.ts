/**
 * Sugestões de coleção (decisão de 2026-11-22): a seção "Sugestões" no topo
 * de `/colecoes`, que mostra ao usuário as coleções que ele já está perto de
 * ter — "Você tem 12 de 100 cartas do set X" — com um botão.
 * Nada é criado nem alocado sem o clique dele (regra 5); este módulo só
 * conta, filtra e ordena. O SQL (`lib/db/sugestoes.ts`) só busca.
 *
 * ## O que conta
 *
 *  - **Cartas físicas distintas que o usuário tem**: `copia.carta_id`
 *    distinto, com qualquer cópia, alocada ou livre. As linhas pt e en do
 *    mesmo `carta_id` são a mesma carta (regra 7), então contam uma vez.
 *  - **Só linhas ocidentais.** Cópia identificada por linha japonesa
 *    (`idioma_catalogo = jp`) fica fora de toda contagem neste primeiro corte
 *    (`ehLinhaOcidental`).
 *  - **Set:** `total` é a numeração **oficial** do set (regra 4, sem
 *    secretas; `resolverUniversoVagasSet`, que só troca para o total no set
 *    sem numeração oficial, como o `mep`) — o que o set é, não o que o
 *    catálogo local conhece dele: um set com 34 linhas de 48 oficiais lê
 *    "x de 48". No set sem numeração oficial o total é o que a criação usa no
 *    lugar dela, e `totalOficial` vem `false` para a tela não chamá-lo de
 *    oficial. `quantidade` são as cartas possuídas, pelo `carta_id`, entre
 *    as cartas do próprio set que entram nas vagas da coleção que o botão
 *    cria (o set lido carta a carta pt→en e cortado pela regra 4,
 *    `resolverChavesVagasSet`); o limiar vale para ela. Uma secreta não conta,
 *    então a porcentagem nunca passa de 100%. Quando o catálogo materializa
 *    menos vagas que a numeração oficial, `vagasMaterializaveis` diz quantas
 *    — a coleção criada nasce com elas e o aviso de catálogo incompleto.
 *    Só é sugerido o set com ao menos uma linha pt/en **ativa** — o mesmo
 *    filtro de `/api/sets`, que a tela de nova coleção usa para resolver o set
 *    que a sugestão manda.
 *  - **Temas:** pelas regras de `tema-colecao.ts` (espécie, tipo,
 *    ilustrador, raridade, forma).
 *
 * Os limiares moram num lugar só (`LIMIARES_SUGESTAO`).
 *
 * ## O que some
 *
 *  - O set que já tem coleção: alguma coleção de set **ocidental** com ele na
 *    receita (`colecoesPorSet`, a mesma regra de "já existe" dos grupos).
 *  - O tema que já tem coleção temática com o mesmo tipo e o mesmo valor.
 *  - O que o usuário dispensou ("Não tenho interesse"): para sempre, gravado
 *    em `sugestao_dispensada`.
 *
 * ## A ordem (`ordenarSugestoes`)
 *
 * Dentro de cada tipo, a mais forte primeiro: set pela porcentagem possuída,
 * depois pela quantidade; tema pela quantidade. Entre tipos, **rodadas**:
 * a primeira rodada leva a melhor de cada tipo, a segunda a segunda de cada
 * um, e assim por diante — seis temas de ilustrador não empurram a sugestão
 * de set para fora das seis que a tela mostra. Dentro de uma rodada, a ordem
 * é pela força relativa ao limiar (`quantidade / limiar`: 40 cartas de um
 * tipo, limiar 20, valem 2; 10 de uma espécie, limiar 5, também 2), e o
 * empate segue `ORDEM_TIPOS_SUGESTAO`.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { colecoesPorSet, nomeSugeridoDoSet, type ColecaoComReceita } from "./grupos-colecao";
import { recusa, type Recusa } from "./recusa";
import {
  chaveTema,
  ehLinhaOcidental,
  temaDaColecao,
  temasDaLinha,
  validarValorTema,
  type LinhaTematica,
  type TemaColecao,
  type TipoTema,
} from "./tema-colecao";
import { contagensDoSet, escolherLinhaPorCarta } from "./idioma-catalogo";
import { resolverUniversoVagasSet } from "./numeracao-oficial-set";
import { resolverChavesVagasSet } from "./vagas-colecao";

export const TIPOS_SUGESTAO = ["set", "especie", "tipo", "ilustrador", "raridade", "forma"] as const;
export type TipoSugestao = (typeof TIPOS_SUGESTAO)[number];

export function ehTipoSugestao(v: unknown): v is TipoSugestao {
  return typeof v === "string" && (TIPOS_SUGESTAO as readonly string[]).includes(v);
}

/** O mínimo de cartas físicas distintas para uma sugestão aparecer, por tipo. */
export const LIMIARES_SUGESTAO: Readonly<Record<TipoSugestao, number>> = {
  set: 5,
  especie: 5,
  tipo: 20,
  ilustrador: 8,
  raridade: 10,
  forma: 5,
};

/** Quantas a seção mostra antes de "Ver todas". */
export const MAXIMO_SUGESTOES_VISIVEIS = 6;

/** Desempate entre tipos numa mesma rodada de `ordenarSugestoes`. */
export const ORDEM_TIPOS_SUGESTAO: readonly TipoSugestao[] = [
  "set",
  "especie",
  "tipo",
  "raridade",
  "forma",
  "ilustrador",
];

/** Uma carta possuída, pela linha de catálogo da cópia. */
export interface CartaPossuida extends LinhaTematica {
  cartaId: string;
  /** O idioma da LINHA de catálogo (`copia.idioma_catalogo`), não o da carta física. */
  idioma: string;
  setId: string;
  localId: string;
}

/** Um set do catálogo ocidental, lido carta a carta (pt→en). */
export interface UniversoDoSet {
  setId: string;
  /** Nome em pt, senão en. */
  nome: string;
  sigla: string | null;
  lancamento: string | null;
  /** As cartas do set, uma por número (`escolherLinhaPorCarta`). */
  cartas: readonly { cartaId: string; localId: string }[];
  qtdOficial: number;
  qtdTotal: number;
  /**
   * O set tem ao menos uma linha pt/en ativa — o mesmo filtro de `/api/sets`
   * (`listarSetsParaCadastro`). O universo de vagas usa todas as linhas, ativas
   * ou não, como a criação (`obterInfoSetParaVagas`); este é só o portão.
   */
  temLinhaAtiva: boolean;
}

interface SugestaoBase {
  /** `tipo:valor` — a identidade da sugestão, a mesma da dispensa. */
  chave: string;
  /**
   * Cartas físicas distintas que o usuário tem: no set, entre as do próprio
   * set que entram nas vagas; no tema, as que cabem nele.
   */
  quantidade: number;
}

/** Sugestão de coleção de set. */
export interface SugestaoDeSet extends SugestaoBase {
  tipo: "set";
  /** O `set_id`. */
  valor: string;
  setId: string;
  /** Nome do set, pt senão en. */
  rotulo: string;
  /**
   * O denominador de "x de N": a numeração oficial do set (regra 4) — ou,
   * no set sem numeração oficial (`mep`, `totalOficial: false`), o total que a
   * criação usa no lugar dela (`resolverUniversoVagasSet`).
   */
  total: number;
  /**
   * `total` é a numeração oficial? `false` só no set sem numeração oficial no
   * upstream: a tela não pode chamar esse número de "oficial".
   */
  totalOficial: boolean;
  /**
   * Só quando o catálogo local materializa menos vagas que `total` (set
   * incompleto no upstream): quantas a coleção criada teria.
   */
  vagasMaterializaveis?: number;
  /** O nome que a criação propõe (`AAAA - SIGLA - Nome`, `nomeSugeridoDoSet`). */
  nomeSugerido: string;
}

/**
 * Sugestão de tema. `valor` é a chave canônica do tema: o número nacional
 * (espécie), o tipo em inglês (`tiposPokemon`), a raridade canônica em inglês
 * (`raridadesCarta`), a forma (`temaColecao.formas`) ou o ilustrador como
 * gravado — a tela traduz por ela e mostra como está o que não tem entrada.
 * **Não há `nomeSugerido` em tema, de propósito**: o nome padrão de uma
 * coleção temática a tela monta no idioma da interface; o servidor não sabe em
 * que língua quem pergunta lê.
 */
export interface SugestaoDeTema extends SugestaoBase {
  tipo: TipoTema;
  valor: string;
  /** Só espécie: o nome dela no catálogo (ausente quando o catálogo não o conhece). */
  rotulo?: string;
  total?: never;
  vagasMaterializaveis?: never;
  totalOficial?: never;
  nomeSugerido?: never;
  setId?: never;
}

export type Sugestao = SugestaoDeSet | SugestaoDeTema;

// --- Contagem ----------------------------------------------------------------

function ocidentais(cartas: readonly CartaPossuida[]): CartaPossuida[] {
  return cartas.filter((c) => ehLinhaOcidental(c.idioma));
}

/** Cada tema com as cartas físicas distintas que cabem nele. */
export function contarPorTema(
  cartas: readonly CartaPossuida[],
): Map<string, { tema: TemaColecao; quantidade: number }> {
  const porTema = new Map<string, { tema: TemaColecao; cartas: Set<string> }>();
  for (const carta of ocidentais(cartas)) {
    for (const tema of temasDaLinha(carta)) {
      const chave = chaveTema(tema.tipo, tema.valor);
      const atual = porTema.get(chave);
      if (atual) atual.cartas.add(carta.cartaId);
      else porTema.set(chave, { tema, cartas: new Set([carta.cartaId]) });
    }
  }
  return new Map([...porTema].map(([k, v]) => [k, { tema: v.tema, quantidade: v.cartas.size }]));
}

/** Cada set com as cartas físicas distintas possuídas dele (`carta_id`). */
function cartasPorSet(cartas: readonly CartaPossuida[]): Map<string, Set<string>> {
  const porSet = new Map<string, Set<string>>();
  for (const c of ocidentais(cartas)) {
    const doSet = porSet.get(c.setId);
    if (doSet) doSet.add(c.cartaId);
    else porSet.set(c.setId, new Set([c.cartaId]));
  }
  return porSet;
}

/**
 * Os sets que vale ler no catálogo: os com pelo menos `LIMIARES_SUGESTAO.set`
 * cartas distintas possuídas, antes do corte da numeração oficial. É um filtro
 * mais largo que o final (o corte só tira), para o SQL não ler o catálogo
 * inteiro.
 */
export function setsCandidatos(cartas: readonly CartaPossuida[]): string[] {
  return [...cartasPorSet(cartas)]
    .filter(([, doSet]) => doSet.size >= LIMIARES_SUGESTAO.set)
    .map(([setId]) => setId)
    .sort();
}

/** As espécies que chegam ao limiar — as únicas cujo nome a leitura precisa buscar. */
export function especiesCandidatas(cartas: readonly CartaPossuida[]): number[] {
  return [...contarPorTema(cartas).values()]
    .filter((t) => t.tema.tipo === "especie" && t.quantidade >= LIMIARES_SUGESTAO.especie)
    .map((t) => Number(t.tema.valor))
    .sort((a, b) => a - b);
}

/**
 * A numeração oficial do set (`total`), as vagas que o catálogo materializa
 * para ela, e quantas das cartas possuídas (por `carta_id`) caem nessas vagas.
 */
export function contarNoSet(
  universo: Pick<UniversoDoSet, "cartas" | "qtdOficial" | "qtdTotal">,
  possuidas: ReadonlySet<string>,
): { quantidade: number; total: number; totalOficial: boolean; vagasMaterializaveis: number } {
  const { vagasEsperadas, avisoSemNumeracaoOficial } = resolverUniversoVagasSet({
    qtdOficial: universo.qtdOficial,
    qtdTotal: universo.qtdTotal,
    incluirSecretas: false,
    qtdCartasNoCatalogo: universo.cartas.length,
  });
  const vagas = new Set(
    resolverChavesVagasSet({
      localIdsDoSet: universo.cartas.map((c) => c.localId),
      qtdOficial: universo.qtdOficial,
      qtdTotal: universo.qtdTotal,
      incluirSecretas: false,
    }),
  );
  const cartasNasVagas = universo.cartas.filter((c) => vagas.has(c.localId)).map((c) => c.cartaId);
  const quantidade = new Set(cartasNasVagas.filter((id) => possuidas.has(id))).size;
  return {
    quantidade,
    total: vagasEsperadas,
    totalOficial: avisoSemNumeracaoOficial === null,
    vagasMaterializaveis: vagas.size,
  };
}

/** Uma linha de `carta_catalogo` de um set candidato, como a leitura a traz. */
export interface LinhaDoSet {
  cartaId: string;
  /** `carta_catalogo.ativa`. */
  ativa: boolean;
  setId: string;
  idioma: "pt" | "en";
  localId: string;
  qtdOficial: number;
  qtdTotal: number;
  setNome: string;
  setSigla: string | null;
  setLancamento: string | null;
}

/**
 * Cada set lido carta a carta com preferência pt (`escolherLinhaPorCarta`) — o
 * mesmo universo que a coleção criada com catálogo pt teria —, com as
 * contagens da união (`contagensDoSet`) e nome, sigla e lançamento da linha pt
 * quando houver, senão da en.
 */
export function universosDosSets(linhas: readonly LinhaDoSet[]): Map<string, UniversoDoSet> {
  const porSet = new Map<string, LinhaDoSet[]>();
  for (const l of linhas) {
    const lista = porSet.get(l.setId);
    if (lista) lista.push(l);
    else porSet.set(l.setId, [l]);
  }
  const universos = new Map<string, UniversoDoSet>();
  for (const [setId, doSet] of porSet) {
    const preferidas = [...doSet].sort((a, b) => (a.idioma === b.idioma ? 0 : a.idioma === "pt" ? -1 : 1));
    const primeiro = <T>(f: (l: LinhaDoSet) => T | null): T | null =>
      preferidas.map(f).find((v) => v !== null) ?? null;
    universos.set(setId, {
      setId,
      nome: preferidas[0].setNome,
      sigla: primeiro((l) => l.setSigla),
      lancamento: primeiro((l) => l.setLancamento),
      cartas: escolherLinhaPorCarta(doSet, "pt").map((l) => ({ cartaId: l.cartaId, localId: l.localId })),
      ...contagensDoSet(doSet),
      temLinhaAtiva: doSet.some((l) => l.ativa),
    });
  }
  return universos;
}

// --- Montagem ----------------------------------------------------------------

export interface EntradaSugestoes {
  cartas: readonly CartaPossuida[];
  /** Os sets candidatos (`setsCandidatos`), como o catálogo os conhece. */
  sets: ReadonlyMap<string, UniversoDoSet>;
  colecoes: readonly ColecaoComReceita[];
  dispensadas: readonly { tipo: string; valor: string }[];
  nomesEspecie: ReadonlyMap<number, string | null>;
}

/** Todas as sugestões, sem as cobertas e sem as dispensadas, já na ordem (`ordenarSugestoes`). */
export function montarSugestoes(e: EntradaSugestoes): Sugestao[] {
  const dispensadas = new Set(e.dispensadas.map((d) => chaveTema(d.tipo, d.valor)));
  const setsComColecao = colecoesPorSet(e.colecoes);
  const temasComColecao = new Set(
    e.colecoes.flatMap((c) => {
      const tema = temaDaColecao(c);
      return tema ? [chaveTema(tema.tipo, tema.valor)] : [];
    }),
  );

  const sugestoes: Sugestao[] = [];

  for (const [setId, possuidas] of cartasPorSet(e.cartas)) {
    const universo = e.sets.get(setId);
    if (!universo) continue;
    const chave = chaveTema("set", setId);
    if (dispensadas.has(chave) || setsComColecao.has(setId)) continue;
    // O set que o catálogo inativou inteiro (sem linha pt/en ativa) não é
    // sugerido: `/api/sets` (`listarSetsParaCadastro`) só lista sets com linha
    // ativa, e a tela de nova coleção, preenchida pela sugestão, não o acharia.
    if (!universo.temLinhaAtiva) continue;
    const { quantidade, total, totalOficial, vagasMaterializaveis } = contarNoSet(universo, possuidas);
    if (quantidade < LIMIARES_SUGESTAO.set) continue;
    sugestoes.push({
      chave,
      tipo: "set",
      valor: setId,
      rotulo: universo.nome,
      quantidade,
      total,
      totalOficial,
      ...(vagasMaterializaveis < total ? { vagasMaterializaveis } : {}),
      nomeSugerido: nomeSugeridoDoSet({
        lancamento: universo.lancamento,
        sigla: universo.sigla,
        nome: universo.nome,
      }),
      setId,
    });
  }

  for (const [chave, { tema, quantidade }] of contarPorTema(e.cartas)) {
    if (quantidade < LIMIARES_SUGESTAO[tema.tipo]) continue;
    if (dispensadas.has(chave) || temasComColecao.has(chave)) continue;
    const rotulo = tema.tipo === "especie" ? (e.nomesEspecie.get(Number(tema.valor)) ?? undefined) : undefined;
    sugestoes.push({
      chave,
      tipo: tema.tipo,
      valor: tema.valor,
      ...(rotulo !== undefined ? { rotulo } : {}),
      quantidade,
    });
  }

  return ordenarSugestoes(sugestoes);
}

// --- Ordem ---------------------------------------------------------------------

function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A mais forte primeiro, dentro de um tipo. Porcentagem por produto cruzado, sem ponto flutuante. */
function compararNoTipo(a: Sugestao, b: Sugestao): number {
  if (a.tipo === "set" && b.tipo === "set") {
    const porcentagem = b.quantidade * (a.total ?? 0) - a.quantidade * (b.total ?? 0);
    if (porcentagem !== 0) return porcentagem;
  }
  return b.quantidade - a.quantidade || compararTexto(a.valor, b.valor);
}

/** Força relativa ao limiar do tipo, por produto cruzado: positivo quando `b` é mais forte. */
function compararForca(a: Sugestao, b: Sugestao): number {
  return b.quantidade * LIMIARES_SUGESTAO[a.tipo] - a.quantidade * LIMIARES_SUGESTAO[b.tipo];
}

/** Ver "A ordem" no cabeçalho. */
export function ordenarSugestoes(sugestoes: readonly Sugestao[]): Sugestao[] {
  const porTipo = ORDEM_TIPOS_SUGESTAO.map((tipo) =>
    sugestoes.filter((s) => s.tipo === tipo).sort(compararNoTipo),
  );
  const rodadas = Math.max(0, ...porTipo.map((l) => l.length));
  const ordenadas: Sugestao[] = [];
  for (let i = 0; i < rodadas; i++) {
    const rodada = porTipo.flatMap((l) => (i < l.length ? [l[i]] : []));
    rodada.sort(
      (a, b) =>
        compararForca(a, b) ||
        ORDEM_TIPOS_SUGESTAO.indexOf(a.tipo) - ORDEM_TIPOS_SUGESTAO.indexOf(b.tipo),
    );
    ordenadas.push(...rodada);
  }
  return ordenadas;
}

// --- Dispensa ------------------------------------------------------------------

/**
 * O corpo de "Não tenho interesse": `{ tipo, valor }`. O tipo tem de ser um dos
 * conhecidos; o valor de um tema passa pela mesma validação da coleção temática
 * (`validarValorTema`), e o de um set é um `set_id` não vazio.
 */
export function lerDispensa(
  corpo: unknown,
): { ok: true; tipo: TipoSugestao; valor: string } | { ok: false; recusa: Recusa } {
  const obj = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  if (!ehTipoSugestao(obj.tipo)) {
    return { ok: false, recusa: recusa("sugestaoInvalida") };
  }
  if (obj.tipo === "set") {
    const valor = typeof obj.valor === "string" ? obj.valor : "";
    if (valor.trim() === "" || valor.length > 200) return { ok: false, recusa: recusa("sugestaoInvalida") };
    return { ok: true, tipo: "set", valor };
  }
  const tipo: TipoTema = obj.tipo;
  const r = validarValorTema(tipo, obj.valor);
  if (!r.ok) return { ok: false, recusa: recusa("sugestaoInvalida") };
  return { ok: true, tipo, valor: r.tema.valor };
}
