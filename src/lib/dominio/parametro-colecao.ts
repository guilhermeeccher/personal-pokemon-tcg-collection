/**
 * Tipagem e validação do parâmetro de `colecao` por tipo (spec §3.3):
 *
 * - `pokedex`: `{ escopo: "nacional" }` ou `{ escopo: "regioes", regioes: [...] }`.
 * - `set`: `{ sets, idiomaCatalogo, incluirSecretas, excluidas }`. `sets` é
 *   a RECEITA da coleção: os sets cujas vagas nasceram na criação, na ordem
 *   escolhida (2026-09-30 — antes era um `setId` só; a entrada ainda aceita
 *   `setId` e o converte). Depois de criada, a coleção é a lista das vagas
 *   dela, que o usuário edita carta a carta; `excluidas` lembra as cartas
 *   da receita que ele tirou, para o toggle de secretas não trazê-las de
 *   volta. `idiomaCatalogo` é o idioma PREFERIDO da ficha, carta a carta
 *   (`escolherLinhaPorCarta`) — independente do `idiomaExigido` da
 *   coleção, que é o idioma da carta FÍSICA (AGENTS.md regra 7).
 * - `customizada`: sem parâmetro (null) ou, na coleção temática (decisão de
 *   2026-11-22), `{ tema: { tipo, valor } }` — validado por
 *   `tema-colecao.ts`. Nada além dessas duas formas.
 *
 * Parâmetro inválido para o tipo é rejeitado com erro claro — nunca
 * normalizado no silêncio (decisão explícita da tarefa).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { type Regiao, ehRegiao } from "./escopo-pokedex";
import type { IdiomaCatalogo } from "./idioma-catalogo";
import { type ParametroCustomizadaTema, validarParametroCustomizada } from "./tema-colecao";

export const TIPOS_COLECAO = ["pokedex", "set", "customizada"] as const;
export type TipoColecao = (typeof TIPOS_COLECAO)[number];

export function ehTipoColecao(v: unknown): v is TipoColecao {
  return typeof v === "string" && (TIPOS_COLECAO as readonly string[]).includes(v);
}

export type ParametroPokedex =
  | { escopo: "nacional" }
  | { escopo: "regioes"; regioes: Regiao[] };

export interface ParametroSet {
  /** A receita: sets cujas vagas nasceram na criação, na ordem escolhida. Nunca vazia. */
  sets: string[];
  idiomaCatalogo: IdiomaCatalogo;
  incluirSecretas: boolean;
  /**
   * Chaves de vaga (`chaveVagaSet`) de cartas da receita que o usuário tirou
   * da coleção. Ausente = nenhuma. Não vem do corpo da criação: é gravada
   * pela exclusão de vaga.
   */
  excluidas?: string[];
}

/** Limite de sets numa receita — folgado para o caso real (2), e um teto contra erro de digitação na API. */
export const MAXIMO_SETS_POR_COLECAO = 10;

/**
 * `customizada` não tem parâmetro estrutural: `null` na simples, o tema na
 * temática. O tema não cria vaga — a vaga da customizada continua nascendo
 * ao alocar.
 */
export type ParametroCustomizada = ParametroCustomizadaTema | null;

export type ParametroColecao =
  | { tipo: "pokedex"; parametro: ParametroPokedex }
  | { tipo: "set"; parametro: ParametroSet }
  | { tipo: "customizada"; parametro: ParametroCustomizada };

export type ResultadoValidacaoParametro =
  | { ok: true; resultado: ParametroColecao }
  | { ok: false; erros: string[] };

function ehIdiomaCatalogo(v: unknown): v is IdiomaCatalogo {
  // `jp` incluído em 2026-08-26, junto com a entrada do catálogo japonês:
  // sem ele, não seria possível criar coleção de um set exclusivo do Japão.
  return v === "pt" || v === "en" || v === "jp";
}

/**
 * Exportada (além de usada internamente por `validarParametroColecao`)
 * para ser reaproveitada por `PATCH /api/colecoes/:id/escopo` (item 1):
 * o corpo do patch de escopo é a mesma forma de `ParametroPokedex` — não
 * há razão para uma segunda validação divergente.
 */
export function validarParametroPokedex(bruto: unknown): { ok: true; parametro: ParametroPokedex } | { ok: false; erros: string[] } {
  if (typeof bruto !== "object" || bruto === null) {
    return { ok: false, erros: ["parametro de pokedex precisa ser um objeto com 'escopo'"] };
  }
  const obj = bruto as Record<string, unknown>;
  if (obj.escopo === "nacional") {
    return { ok: true, parametro: { escopo: "nacional" } };
  }
  if (obj.escopo === "regioes") {
    const regioesBruto = obj.regioes;
    if (!Array.isArray(regioesBruto) || regioesBruto.length === 0) {
      return { ok: false, erros: ["escopo 'regioes' exige ao menos uma região em 'regioes'"] };
    }
    const erros: string[] = [];
    const regioes: Regiao[] = [];
    for (const r of regioesBruto) {
      if (!ehRegiao(r)) {
        erros.push(`região inválida: ${String(r)}`);
      } else {
        regioes.push(r);
      }
    }
    if (erros.length > 0) return { ok: false, erros };
    return { ok: true, parametro: { escopo: "regioes", regioes } };
  }
  return {
    ok: false,
    erros: [`escopo inválido: ${String(obj.escopo)} (esperado 'nacional' ou 'regioes')`],
  };
}

function validarParametroSet(bruto: unknown): { ok: true; parametro: ParametroSet } | { ok: false; erros: string[] } {
  if (typeof bruto !== "object" || bruto === null) {
    return { ok: false, erros: ["parametro de set precisa ser um objeto com sets, idiomaCatalogo e incluirSecretas"] };
  }
  const obj = bruto as Record<string, unknown>;
  const erros: string[] = [];

  // `setId` (um set só) é o formato de antes de 2026-09-30 — ainda aceito,
  // e convertido. `sets` vence quando vierem os dois.
  const brutos: unknown[] = Array.isArray(obj.sets)
    ? obj.sets
    : obj.setId !== undefined
      ? [obj.setId]
      : [];
  const sets: string[] = [];
  for (const s of brutos) {
    if (typeof s !== "string" || s.trim() === "") {
      erros.push(`set inválido: ${String(s)}`);
    } else if (!sets.includes(s)) {
      sets.push(s);
    }
  }
  if (brutos.length === 0) erros.push("sets ausente ou vazio (ao menos um set)");
  if (sets.length > MAXIMO_SETS_POR_COLECAO) {
    erros.push(`no máximo ${MAXIMO_SETS_POR_COLECAO} sets por coleção (vieram ${sets.length})`);
  }

  if (!ehIdiomaCatalogo(obj.idiomaCatalogo)) {
    erros.push(`idiomaCatalogo inválido: ${String(obj.idiomaCatalogo)} (esperado 'pt' ou 'en')`);
  }

  if (typeof obj.incluirSecretas !== "boolean") {
    erros.push(`incluirSecretas inválido: ${String(obj.incluirSecretas)} (esperado boolean)`);
  }

  if (erros.length > 0) return { ok: false, erros };

  return {
    ok: true,
    parametro: {
      sets,
      idiomaCatalogo: obj.idiomaCatalogo as IdiomaCatalogo,
      incluirSecretas: obj.incluirSecretas as boolean,
    },
  };
}

/**
 * Valida o parâmetro bruto (vindo do corpo JSON) contra o tipo de
 * coleção. `customizada` aceita só nulo/vazio (a simples) ou exatamente
 * `{ tema: { tipo, valor } }` (a temática, `validarParametroCustomizada`)
 * — qualquer outra coisa é recusada (spec §3.3).
 */
export function validarParametroColecao(
  tipo: unknown,
  parametroBruto: unknown,
): ResultadoValidacaoParametro {
  if (!ehTipoColecao(tipo)) {
    return { ok: false, erros: [`tipo de coleção inválido: ${String(tipo)}`] };
  }

  if (tipo === "customizada") {
    const r = validarParametroCustomizada(parametroBruto);
    if (!r.ok) return r;
    return { ok: true, resultado: { tipo: "customizada", parametro: r.parametro } };
  }

  if (tipo === "pokedex") {
    const r = validarParametroPokedex(parametroBruto);
    if (!r.ok) return r;
    return { ok: true, resultado: { tipo: "pokedex", parametro: r.parametro } };
  }

  // tipo === "set"
  const r = validarParametroSet(parametroBruto);
  if (!r.ok) return r;
  return { ok: true, resultado: { tipo: "set", parametro: r.parametro } };
}
