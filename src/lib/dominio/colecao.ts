/**
 * Validação de criação e edição de `colecao` (spec §3.3, Fase 2). O
 * parâmetro estrutural (escopo/set/secretas) é validado por
 * `parametro-colecao.ts` — este módulo cuida dos campos comuns aos três
 * tipos: nome, notas e `idiomaExigido`.
 *
 * Edição nunca toca o parâmetro estrutural (decisão da tarefa: mudar
 * escopo/set com vagas já preenchidas invalidaria o universo da coleção)
 * — a única exceção, ligar/desligar `incluirSecretas`, tem fluxo próprio
 * na camada de consultas (`alternarSecretasDaColecao`), porque mexe em
 * vagas, não é só um patch de campo.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { type Idioma, ehIdioma } from "./enums";
import {
  type ParametroPokedex,
  type ParametroSet,
  type TipoColecao,
  validarParametroColecao,
} from "./parametro-colecao";

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// --- Criação -----------------------------------------------------------

export interface CriacaoColecaoBruta {
  nome?: unknown;
  tipo?: unknown;
  parametro?: unknown;
  idiomaExigido?: unknown;
  notas?: unknown;
}

export interface ColecaoCriadaValida {
  nome: string;
  tipo: TipoColecao;
  parametro: ParametroPokedex | ParametroSet | null;
  idiomaExigido: Idioma | null;
  notas: string | null;
}

export type ResultadoValidacaoColecao =
  | { ok: true; colecao: ColecaoCriadaValida }
  | { ok: false; erros: string[] };

export function validarCriacaoColecao(
  bruto: CriacaoColecaoBruta,
): ResultadoValidacaoColecao {
  const erros: string[] = [];

  const nome =
    typeof bruto.nome === "string" && bruto.nome.trim() !== ""
      ? bruto.nome.trim()
      : null;
  if (!nome) erros.push("nome ausente ou vazio");

  let idiomaExigido: Idioma | null = null;
  if (bruto.idiomaExigido !== undefined && bruto.idiomaExigido !== null) {
    if (!ehIdioma(bruto.idiomaExigido)) {
      erros.push(`idiomaExigido inválido: ${String(bruto.idiomaExigido)}`);
    } else {
      idiomaExigido = bruto.idiomaExigido;
    }
  }

  const resultadoParametro = validarParametroColecao(bruto.tipo, bruto.parametro);
  if (!resultadoParametro.ok) erros.push(...resultadoParametro.erros);

  if (erros.length > 0 || !nome || !resultadoParametro.ok) {
    return { ok: false, erros };
  }

  return {
    ok: true,
    colecao: {
      nome,
      tipo: resultadoParametro.resultado.tipo,
      parametro: resultadoParametro.resultado.parametro,
      idiomaExigido,
      notas: textoOpcional(bruto.notas),
    },
  };
}

// --- Edição --------------------------------------------------------------

export interface EdicaoColecaoBruta {
  nome?: unknown;
  notas?: unknown;
  idiomaExigido?: unknown;
  /** Nunca editável por aqui — só para detectar e recusar a tentativa. */
  parametro?: unknown;
  /** Idem. */
  tipo?: unknown;
}

export interface PatchColecaoValido {
  nome?: string;
  notas?: string | null;
  idiomaExigido?: Idioma | null;
}

export type ResultadoValidacaoEdicaoColecao =
  | { ok: true; patch: PatchColecaoValido }
  | { ok: false; erros: string[] };

export function validarEdicaoColecao(
  bruto: EdicaoColecaoBruta,
): ResultadoValidacaoEdicaoColecao {
  const erros: string[] = [];
  const patch: PatchColecaoValido = {};

  // O parâmetro estrutural (escopo/set/secretas) e o tipo nunca são
  // editáveis por este endpoint — mudar o universo de uma coleção com
  // vagas já preenchidas invalidaria o progresso. A intenção é RECUSAR,
  // não ignorar em silêncio (achado do coordenador, 2026-08-25): um PATCH
  // que traz `parametro` ou `tipo` tem que voltar 400, nunca 200 com
  // "ok:true" fingindo que aplicou algo que não aplicou. A única exceção
  // estrutural suportada é `incluirSecretas`, via
  // `PATCH /api/colecoes/:id/secretas`.
  if (bruto.parametro !== undefined) {
    erros.push(
      "parametro não pode ser editado depois de criado — para incluirSecretas use PATCH /api/colecoes/:id/secretas",
    );
  }
  if (bruto.tipo !== undefined) {
    erros.push("tipo não pode ser editado depois de criado");
  }

  if (bruto.nome !== undefined) {
    const nome = typeof bruto.nome === "string" ? bruto.nome.trim() : "";
    if (nome === "") erros.push("nome não pode ser vazio");
    else patch.nome = nome;
  }

  if (bruto.notas !== undefined) {
    patch.notas = textoOpcional(bruto.notas);
  }

  if (bruto.idiomaExigido !== undefined) {
    if (bruto.idiomaExigido === null) {
      patch.idiomaExigido = null;
    } else if (!ehIdioma(bruto.idiomaExigido)) {
      erros.push(`idiomaExigido inválido: ${String(bruto.idiomaExigido)}`);
    } else {
      patch.idiomaExigido = bruto.idiomaExigido;
    }
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, patch };
}
