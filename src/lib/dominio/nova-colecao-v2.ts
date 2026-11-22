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

import type { Idioma } from "./enums";
import type { Regiao } from "./escopo-pokedex";
import type { IdiomaCatalogo } from "./idioma-catalogo";
import type { TipoColecao } from "./parametro-colecao";
import type { SetParaCadastroDTO } from "./tipos-cliente";

export type EscopoPokedex = "nacional" | "regioes";

export interface EstadoFormularioNova {
  tipo: TipoColecao;
  nome: string;
  idiomaExigido: Idioma | "";
  notas: string;
  grupoId: string;
  escopo: EscopoPokedex;
  regioes: readonly Regiao[];
  /** A receita: os sets na ordem em que foram escolhidos. */
  sets: readonly Pick<SetParaCadastroDTO, "setId">[];
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
  /** A chave do que falta, que a tela traduz: `regiao` ou `expansao`. */
  | { ok: false; erro: "regiao" | "expansao" };

/**
 * O corpo do `POST /api/colecoes`. As duas conferências daqui só evitam uma
 * ida ao servidor com o que a tela já sabe estar incompleto: pokédex por
 * regiões sem nenhuma região, set sem nenhum set na receita. O resto (nome,
 * limites, ids) é validado pelo servidor, que responde com a lista de erros.
 */
export function montarCorpoCriacao(e: EstadoFormularioNova): ResultadoCorpo {
  let parametro: unknown;
  if (e.tipo === "pokedex") {
    if (e.escopo === "regioes" && e.regioes.length === 0) return { ok: false, erro: "regiao" };
    parametro = e.escopo === "nacional" ? { escopo: "nacional" } : { escopo: "regioes", regioes: [...e.regioes] };
  } else if (e.tipo === "set") {
    if (e.sets.length === 0) return { ok: false, erro: "expansao" };
    parametro = {
      sets: e.sets.map((s) => s.setId),
      idiomaCatalogo: e.idiomaCatalogo,
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

/** Acrescenta um set ao fim da receita; um set que já está nela não entra duas vezes. */
export function adicionarSetNaReceita<T extends { setId: string }>(atuais: readonly T[], set: T): T[] {
  return atuais.some((s) => s.setId === set.setId) ? [...atuais] : [...atuais, set];
}

export function removerSetDaReceita<T extends { setId: string }>(atuais: readonly T[], setId: string): T[] {
  return atuais.filter((s) => s.setId !== setId);
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
 */
export function totaisDeSecretas(sets: readonly Pick<SetParaCadastroDTO, "qtdOficial" | "qtdTotal">[]): {
  total: number;
  oficiais: number;
} {
  return {
    total: sets.reduce((soma, s) => soma + s.qtdTotal, 0),
    oficiais: sets.reduce((soma, s) => soma + (s.qtdOficial > 0 ? s.qtdOficial : s.qtdTotal), 0),
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
