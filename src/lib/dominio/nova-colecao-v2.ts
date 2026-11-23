/**
 * O formulário de "Nova coleção" da v2 (`/colecoes/nova`): o que ele monta e
 * confere antes de mandar `POST /api/colecoes`, o caminho único de criação.
 * Módulo puro — a tela só liga estes passos aos campos.
 *
 * Nada aqui decide regra de negócio: quem resolve as vagas, a numeração
 * oficial (regra 4) e a ficha de cada carta é o servidor
 * (`resolverCriacaoColecao`). O corpo sai igual ao da v1, campo por campo, para
 * as duas telas serem o mesmo pedido.
 */

import { formatarIdiomasDisponiveis, formatarRotuloSet, type TextosRotuloSet } from "./agrupamento-sets";
import type { Idioma } from "./enums";
import type { Regiao } from "./escopo-pokedex";
import type { FiltroIdiomaSet } from "./filtro-idioma-set";
import type { IdiomaCatalogo } from "./idioma-catalogo";
import type { TipoColecao } from "./parametro-colecao";
import type { SetParaCadastroDTO } from "./tipos-cliente";

export type EscopoPokedex = "nacional" | "regioes";

/**
 * De qual catálogo vem um set da receita: o japonês ou o ocidental (pt/en).
 * É uma escolha **do catálogo do set escolhido, nunca do id**: `neo1` a
 * `neo4` têm o mesmo `set_id` no inglês e no japonês e são cartas diferentes
 * (`neo1` tem 111 cartas `1..111` em en e 96 `001..096` em jp, sem número em
 * comum). O japonês nunca é fallback de pt/en, nem o contrário
 * (`AGENTS.md`, "Catalog language is decided card by card").
 */
export type CatalogoDoSet = "jp" | "ocidental";

/** Um set na receita, com o catálogo de que foi escolhido. */
export interface SetNaReceita<T extends { setId: string } = SetParaCadastroDTO> {
  set: T;
  catalogo: CatalogoDoSet;
}

/**
 * O catálogo do set que a pessoa acabou de escolher. `/api/sets` traz uma
 * linha por `set_id`, com o idioma resolvido pela prioridade pt > en > jp: um
 * set só japonês vem `jp`; um set nos dois (`neo1`) vem ocidental. Quem
 * escolheu um set dos dois com o filtro de idioma em "Japonês" quis o japonês;
 * em qualquer outro filtro, o ocidental. Um set que não existe no catálogo
 * japonês nunca vira japonês, qualquer que seja o filtro.
 */
export function catalogoDoSetEscolhido(
  set: { idiomaCatalogo: Idioma; idiomasDisponiveis: readonly Idioma[] },
  filtro: FiltroIdiomaSet,
): CatalogoDoSet {
  if (set.idiomaCatalogo === "jp") return "jp";
  return filtro === "jp" && set.idiomasDisponiveis.includes("jp") ? "jp" : "ocidental";
}

/**
 * O rótulo da opção no seletor. `/api/sets` traz a linha ocidental de um set
 * dos dois catálogos (`neo1`): o nome, a data e a contagem de cartas dela
 * descrevem outras cartas (111 em inglês, 96 em japonês). Com o filtro em
 * "Japonês" a opção vira a do catálogo japonês, e como a linha na tela não
 * tem os números dele, o rótulo traz só o id e o idioma, nunca os do outro.
 */
export function rotuloDoSetNoSeletor(
  set: Parameters<typeof formatarRotuloSet>[0] & { idiomaCatalogo: Idioma },
  filtro: FiltroIdiomaSet,
  textos: TextosRotuloSet,
): string {
  if (catalogoDoSetEscolhido(set, filtro) === "jp" && set.idiomaCatalogo !== "jp") {
    return `${set.setId} — ${formatarIdiomasDisponiveis(["jp"])}`;
  }
  return formatarRotuloSet(set, textos);
}

export type TipoDaReceita = "vazia" | "ocidental" | "japonesa" | "mista";

/** Só japonesa, só ocidental, ou a mistura que a criação não aceita. */
export function tipoDaReceita(receita: readonly { catalogo: CatalogoDoSet }[]): TipoDaReceita {
  const jp = receita.some((r) => r.catalogo === "jp");
  const ocidental = receita.some((r) => r.catalogo === "ocidental");
  if (jp && ocidental) return "mista";
  if (jp) return "japonesa";
  return ocidental ? "ocidental" : "vazia";
}

export interface EstadoFormularioNova {
  tipo: TipoColecao;
  nome: string;
  idiomaExigido: Idioma | "";
  notas: string;
  grupoId: string;
  escopo: EscopoPokedex;
  regioes: readonly Regiao[];
  /** A receita: os sets na ordem em que foram escolhidos, cada um com o catálogo de que veio. */
  sets: readonly { set: { setId: string }; catalogo: CatalogoDoSet }[];
  /** A preferência pt/en da receita ocidental; numa receita só japonesa não é perguntada. */
  idiomaCatalogo: IdiomaCatalogo;
  incluirSecretas: boolean;
}

export interface CorpoCriacaoColecao {
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
  idiomaExigido: Idioma | undefined;
  notas: string | undefined;
  grupoId: string | null;
}

export type ResultadoCorpo =
  | { ok: true; corpo: CorpoCriacaoColecao }
  /** A chave do que falta, que a tela traduz: `regiao`, `expansao` ou `mistura`. */
  | { ok: false; erro: "regiao" | "expansao" | "mistura" };

/**
 * O corpo do `POST /api/colecoes`. As duas conferências daqui só evitam uma
 * ida ao servidor com o que a tela já sabe estar incompleto: pokédex por
 * regiões sem nenhuma região, set sem nenhum set na receita, e a receita que
 * mistura o catálogo japonês com o ocidental (nunca vai ao servidor). Numa
 * receita só japonesa o idioma do catálogo é `jp`, sem perguntar; numa só
 * ocidental, a preferência pt/en que a pessoa escolheu. O resto (nome,
 * limites, ids) é validado pelo servidor, que responde com a lista de erros.
 */
export function montarCorpoCriacao(e: EstadoFormularioNova): ResultadoCorpo {
  let parametro: unknown;
  if (e.tipo === "pokedex") {
    if (e.escopo === "regioes" && e.regioes.length === 0) return { ok: false, erro: "regiao" };
    parametro = e.escopo === "nacional" ? { escopo: "nacional" } : { escopo: "regioes", regioes: [...e.regioes] };
  } else if (e.tipo === "set") {
    const receita = tipoDaReceita(e.sets);
    if (receita === "vazia") return { ok: false, erro: "expansao" };
    if (receita === "mista") return { ok: false, erro: "mistura" };
    parametro = {
      sets: e.sets.map((s) => s.set.setId),
      idiomaCatalogo: receita === "japonesa" ? "jp" : e.idiomaCatalogo,
      incluirSecretas: e.incluirSecretas,
    };
  } else {
    parametro = null;
  }
  return {
    ok: true,
    corpo: {
      nome: e.nome,
      tipo: e.tipo,
      parametro,
      idiomaExigido: e.idiomaExigido || undefined,
      notas: e.notas || undefined,
      grupoId: e.grupoId || null,
    },
  };
}

/** Liga ou desliga uma região, na ordem em que a pessoa as escolheu. */
export function alternarRegiao(atuais: readonly Regiao[], regiao: Regiao): Regiao[] {
  return atuais.includes(regiao) ? atuais.filter((r) => r !== regiao) : [...atuais, regiao];
}

/**
 * Acrescenta um set ao fim da receita. O mesmo set do mesmo catálogo não entra
 * duas vezes; o mesmo `set_id` de outro catálogo entra (é outro conjunto de
 * cartas, e juntá-los é a mistura que `tipoDaReceita` aponta).
 */
export function adicionarSetNaReceita<T extends { setId: string }>(
  atuais: readonly SetNaReceita<T>[],
  novo: SetNaReceita<T>,
): SetNaReceita<T>[] {
  return atuais.some((r) => r.set.setId === novo.set.setId && r.catalogo === novo.catalogo)
    ? [...atuais]
    : [...atuais, novo];
}

export function removerSetDaReceita<T extends { setId: string }>(
  atuais: readonly SetNaReceita<T>[],
  setId: string,
  catalogo: CatalogoDoSet,
): SetNaReceita<T>[] {
  return atuais.filter((r) => !(r.set.setId === setId && r.catalogo === catalogo));
}

/**
 * O set que uma sugestão pediu (`?set=`). O texto da URL não é confiável: só
 * vale se for o id de um set da lista do catálogo **ocidental** — o japonês é
 * outro catálogo (`neo1` a `neo4` dividem o id com o inglês e são outras
 * cartas), então uma linha `jp` nunca resolve a sugestão.
 */
export function resolverSetInicial<T extends { setId: string; idiomaCatalogo: Idioma }>(
  sets: readonly T[],
  setId: string,
): T | null {
  return sets.find((s) => s.setId === setId && s.idiomaCatalogo !== "jp") ?? null;
}

/**
 * O total da opção "incluir secretas": `total` é a numeração inteira e
 * `oficiais` a oficial (regra 4). Set sem numeração oficial (a Clássica do
 * 30th) conta o total dos dois lados: não tem secretas a ligar.
 *
 * `null` quando algum set da receita foi escolhido no catálogo japonês mas a
 * linha que `/api/sets` trouxe é a ocidental (`neo1`): os números dela são
 * de outro catálogo, e mostrá-los diria uma contagem errada.
 */
export function totaisDeSecretas(
  receita: readonly {
    set: Pick<SetParaCadastroDTO, "qtdOficial" | "qtdTotal" | "idiomaCatalogo">;
    catalogo: CatalogoDoSet;
  }[],
): { total: number; oficiais: number } | null {
  if (receita.some((r) => r.catalogo === "jp" && r.set.idiomaCatalogo !== "jp")) return null;
  return {
    total: receita.reduce((soma, r) => soma + r.set.qtdTotal, 0),
    oficiais: receita.reduce((soma, r) => soma + (r.set.qtdOficial > 0 ? r.set.qtdOficial : r.set.qtdTotal), 0),
  };
}

/**
 * A busca do seletor de expansão: o nome, a sigla **ou o id** do set. O id
 * entra porque, no catálogo japonês, ele É a sigla impressa na carta
 * (`sv2a 002/165`): ali `setSigla` é sempre nulo e o nome está em japonês.
 */
export function buscarSets<T extends { setNome: string; setSigla: string | null; setId: string }>(
  sets: readonly T[],
  termo: string,
): T[] {
  const t = termo.trim().toLowerCase();
  if (!t) return [...sets];
  return sets.filter(
    (s) =>
      s.setNome.toLowerCase().includes(t) ||
      (s.setSigla?.toLowerCase().includes(t) ?? false) ||
      s.setId.toLowerCase().includes(t),
  );
}
