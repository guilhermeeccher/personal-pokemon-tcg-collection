/**
 * Validação de uma cópia avulsa — cadastro por busca (spec §5 Fase 1) e
 * edição de cópia existente. Para o lote da grade por set, ver
 * `lote-copias.ts`.
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import {
  type Condicao,
  type Idioma,
  type VarianteCopia,
  ehCondicao,
  ehIdioma,
  ehVarianteCopia,
} from "./enums";

export interface CampoGraded {
  gradedEmpresa: string | null;
  gradedNota: string | null;
  gradedCertificado: string | null;
}

export interface CampoAquisicao {
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
}

/** Corpo bruto do POST de criação de cópia avulsa (cadastro por busca). */
export interface CriacaoCopiaBruta {
  cartaId?: unknown;
  idiomaCatalogo?: unknown;
  idioma?: unknown;
  variante?: unknown;
  quantidade?: unknown;
  condicao?: unknown;
  localizacao?: unknown;
  gradedEmpresa?: unknown;
  gradedNota?: unknown;
  gradedCertificado?: unknown;
  aquisicaoData?: unknown;
  aquisicaoOrigem?: unknown;
  aquisicaoPreco?: unknown;
  notas?: unknown;
}

export interface CopiaCriadaValida extends CampoGraded, CampoAquisicao {
  cartaId: string;
  idiomaCatalogo: Idioma;
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: Condicao;
  localizacao: string | null;
  notas: string | null;
}

export type ResultadoValidacaoCopia =
  | { ok: true; copia: CopiaCriadaValida }
  | { ok: false; erros: string[] };

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Valida um preço em reais como string decimal (`numeric(10,2)` no banco). */
function precoOpcional(v: unknown, erros: string[]): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    erros.push(`aquisicaoPreco inválido: ${String(v)}`);
    return null;
  }
  return n.toFixed(2);
}

/** Data no formato ISO `YYYY-MM-DD` (coluna `date` do banco). */
function dataOpcional(v: unknown, erros: string[]): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    erros.push(`aquisicaoData inválida (esperado YYYY-MM-DD): ${String(v)}`);
    return null;
  }
  return v;
}

/**
 * Valida a criação de uma cópia avulsa. Identidade da carta (`cartaId` +
 * `idiomaCatalogo`) é obrigatória aqui — vem da carta escolhida na busca.
 */
export function validarCriacaoCopia(
  bruto: CriacaoCopiaBruta,
): ResultadoValidacaoCopia {
  const erros: string[] = [];

  const cartaId =
    typeof bruto.cartaId === "string" && bruto.cartaId.trim() !== ""
      ? bruto.cartaId
      : null;
  if (!cartaId) erros.push("cartaId ausente ou vazio");

  if (!ehIdioma(bruto.idiomaCatalogo)) {
    erros.push(`idiomaCatalogo inválido: ${String(bruto.idiomaCatalogo)}`);
  }
  if (!ehIdioma(bruto.idioma)) {
    erros.push(`idioma inválido: ${String(bruto.idioma)}`);
  }
  if (!ehVarianteCopia(bruto.variante)) {
    erros.push(`variante inválida: ${String(bruto.variante)}`);
  }
  if (!ehCondicao(bruto.condicao)) {
    erros.push(`condicao inválida: ${String(bruto.condicao)}`);
  }
  const quantidade = bruto.quantidade ?? 1;
  if (
    typeof quantidade !== "number" ||
    !Number.isInteger(quantidade) ||
    quantidade < 1
  ) {
    erros.push(`quantidade inválida: ${String(bruto.quantidade)}`);
  }

  const aquisicaoPreco = precoOpcional(bruto.aquisicaoPreco, erros);
  const aquisicaoData = dataOpcional(bruto.aquisicaoData, erros);

  if (erros.length > 0) return { ok: false, erros };

  return {
    ok: true,
    copia: {
      cartaId: cartaId!,
      idiomaCatalogo: bruto.idiomaCatalogo as Idioma,
      idioma: bruto.idioma as Idioma,
      variante: bruto.variante as VarianteCopia,
      quantidade: quantidade as number,
      condicao: bruto.condicao as Condicao,
      localizacao: textoOpcional(bruto.localizacao),
      gradedEmpresa: textoOpcional(bruto.gradedEmpresa),
      gradedNota: textoOpcional(bruto.gradedNota),
      gradedCertificado: textoOpcional(bruto.gradedCertificado),
      aquisicaoData,
      aquisicaoOrigem: textoOpcional(bruto.aquisicaoOrigem),
      aquisicaoPreco,
      notas: textoOpcional(bruto.notas),
    },
  };
}

/**
 * Corpo bruto do PATCH de edição. Identidade da carta (`cartaId` /
 * `idiomaCatalogo`) não é editável por aqui — decisão: editar uma cópia
 * muda como ela é ("como é a minha"), nunca qual carta ela é. Recadastrar
 * como carta diferente é apagar e criar de novo, não editar. Todos os
 * campos são opcionais: só o que vier no corpo é atualizado.
 */
export interface EdicaoCopiaBruta {
  idioma?: unknown;
  variante?: unknown;
  quantidade?: unknown;
  condicao?: unknown;
  localizacao?: unknown;
  gradedEmpresa?: unknown;
  gradedNota?: unknown;
  gradedCertificado?: unknown;
  aquisicaoData?: unknown;
  aquisicaoOrigem?: unknown;
  aquisicaoPreco?: unknown;
  notas?: unknown;
}

/** Apenas os campos efetivamente presentes no corpo (para um UPDATE parcial). */
export type PatchCopiaValido = Partial<
  Pick<
    CopiaCriadaValida,
    | "idioma"
    | "variante"
    | "quantidade"
    | "condicao"
    | "localizacao"
    | "gradedEmpresa"
    | "gradedNota"
    | "gradedCertificado"
    | "aquisicaoData"
    | "aquisicaoOrigem"
    | "aquisicaoPreco"
    | "notas"
  >
>;

export type ResultadoValidacaoEdicaoCopia =
  | { ok: true; patch: PatchCopiaValido }
  | { ok: false; erros: string[] };

export function validarEdicaoCopia(
  bruto: EdicaoCopiaBruta,
): ResultadoValidacaoEdicaoCopia {
  const erros: string[] = [];
  const patch: PatchCopiaValido = {};

  if (bruto.idioma !== undefined) {
    if (!ehIdioma(bruto.idioma)) erros.push(`idioma inválido: ${String(bruto.idioma)}`);
    else patch.idioma = bruto.idioma;
  }
  if (bruto.variante !== undefined) {
    if (!ehVarianteCopia(bruto.variante))
      erros.push(`variante inválida: ${String(bruto.variante)}`);
    else patch.variante = bruto.variante;
  }
  if (bruto.condicao !== undefined) {
    if (!ehCondicao(bruto.condicao))
      erros.push(`condicao inválida: ${String(bruto.condicao)}`);
    else patch.condicao = bruto.condicao;
  }
  if (bruto.quantidade !== undefined) {
    if (
      typeof bruto.quantidade !== "number" ||
      !Number.isInteger(bruto.quantidade) ||
      bruto.quantidade < 1
    ) {
      erros.push(`quantidade inválida: ${String(bruto.quantidade)}`);
    } else {
      patch.quantidade = bruto.quantidade;
    }
  }
  if (bruto.localizacao !== undefined) {
    patch.localizacao = textoOpcional(bruto.localizacao);
  }
  if (bruto.gradedEmpresa !== undefined) {
    patch.gradedEmpresa = textoOpcional(bruto.gradedEmpresa);
  }
  if (bruto.gradedNota !== undefined) {
    patch.gradedNota = textoOpcional(bruto.gradedNota);
  }
  if (bruto.gradedCertificado !== undefined) {
    patch.gradedCertificado = textoOpcional(bruto.gradedCertificado);
  }
  if (bruto.aquisicaoOrigem !== undefined) {
    patch.aquisicaoOrigem = textoOpcional(bruto.aquisicaoOrigem);
  }
  if (bruto.notas !== undefined) {
    patch.notas = textoOpcional(bruto.notas);
  }
  if (bruto.aquisicaoData !== undefined) {
    patch.aquisicaoData = dataOpcional(bruto.aquisicaoData, erros);
  }
  if (bruto.aquisicaoPreco !== undefined) {
    patch.aquisicaoPreco = precoOpcional(bruto.aquisicaoPreco, erros);
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, patch };
}
