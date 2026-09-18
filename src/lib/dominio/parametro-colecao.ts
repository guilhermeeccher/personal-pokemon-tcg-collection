/**
 * Tipagem e validação do parâmetro de `colecao` por tipo (spec §3.3):
 *
 * - `pokedex`: `{ escopo: "nacional" }` ou `{ escopo: "regioes", regioes: [...] }`.
 * - `set`: `{ setId, idiomaCatalogo, incluirSecretas }`. `idiomaCatalogo` é
 *   em qual idioma de catálogo a grade é renderizada (decisão fechada —
 *   independente do `idiomaExigido` da coleção, que é o idioma da carta
 *   FÍSICA, AGENTS.md regra 7).
 * - `customizada`: sem parâmetro (null).
 *
 * Parâmetro inválido para o tipo é rejeitado com erro claro — nunca
 * normalizado no silêncio (decisão explícita da tarefa).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { type Regiao, ehRegiao } from "./escopo-pokedex";
import type { IdiomaCatalogo } from "./idioma-catalogo";

export const TIPOS_COLECAO = ["pokedex", "set", "customizada"] as const;
export type TipoColecao = (typeof TIPOS_COLECAO)[number];

export function ehTipoColecao(v: unknown): v is TipoColecao {
  return typeof v === "string" && (TIPOS_COLECAO as readonly string[]).includes(v);
}

export type ParametroPokedex =
  | { escopo: "nacional" }
  | { escopo: "regioes"; regioes: Regiao[] };

export interface ParametroSet {
  setId: string;
  idiomaCatalogo: IdiomaCatalogo;
  incluirSecretas: boolean;
}

/** `customizada` não tem parâmetro estrutural. */
export type ParametroCustomizada = null;

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
    return { ok: false, erros: ["parametro de set precisa ser um objeto com setId, idiomaCatalogo e incluirSecretas"] };
  }
  const obj = bruto as Record<string, unknown>;
  const erros: string[] = [];

  const setId = typeof obj.setId === "string" && obj.setId.trim() !== "" ? obj.setId : null;
  if (!setId) erros.push("setId ausente ou vazio");

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
      setId: setId!,
      idiomaCatalogo: obj.idiomaCatalogo as IdiomaCatalogo,
      incluirSecretas: obj.incluirSecretas as boolean,
    },
  };
}

/**
 * Valida o parâmetro bruto (vindo do corpo JSON) contra o tipo de
 * coleção. `customizada` rejeita qualquer parâmetro não-nulo/não-vazio —
 * ela não tem parâmetro estrutural (spec §3.3).
 */
export function validarParametroColecao(
  tipo: unknown,
  parametroBruto: unknown,
): ResultadoValidacaoParametro {
  if (!ehTipoColecao(tipo)) {
    return { ok: false, erros: [`tipo de coleção inválido: ${String(tipo)}`] };
  }

  if (tipo === "customizada") {
    const vazio =
      parametroBruto === undefined ||
      parametroBruto === null ||
      (typeof parametroBruto === "object" &&
        parametroBruto !== null &&
        Object.keys(parametroBruto).length === 0);
    if (!vazio) {
      return { ok: false, erros: ["coleção customizada não aceita parâmetro"] };
    }
    return { ok: true, resultado: { tipo: "customizada", parametro: null } };
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
