/**
 * Validação do lote de cópias do cadastro rápido por set (spec §5 Fase 1,
 * critério de aceite: "a grade de um set inteiro é marcada e gravada em
 * uma única submissão, com quantidade, variante, idioma e condição por
 * cópia").
 *
 * A grade inteira chega numa única requisição; este módulo valida o corpo
 * inteiro de uma vez e devolve ou as linhas prontas para `db.insert`, ou a
 * lista completa de erros (não para no primeiro) — quem chama (route
 * handler) decide o que fazer com o resultado. Nenhuma linha é inserida se
 * houver qualquer erro: tudo ou nada, coerente com "uma única submissão".
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

/** Um item da grade, como chega do cliente (formato ainda não validado). */
export interface ItemLoteBruto {
  cartaId?: unknown;
  quantidade?: unknown;
  variante?: unknown;
  idioma?: unknown;
  condicao?: unknown;
  localizacao?: unknown;
}

export interface LoteCopiasBruto {
  idiomaCatalogo?: unknown;
  itens?: unknown;
}

/** Linha pronta para `db.insert(copia).values(...)`. */
export interface CopiaParaInserir {
  cartaId: string;
  idiomaCatalogo: Idioma;
  idioma: Idioma;
  variante: VarianteCopia;
  quantidade: number;
  condicao: Condicao;
  localizacao: string | null;
}

export interface ErroItemLote {
  indice: number;
  cartaId: string | null;
  motivo: string;
}

export type ResultadoValidacaoLote =
  | { ok: true; idiomaCatalogo: Idioma; copias: CopiaParaInserir[] }
  | { ok: false; erros: ErroItemLote[] };

/**
 * Valida e normaliza o lote inteiro da grade de um set.
 *
 * Regras:
 * - `idiomaCatalogo` é único para o lote inteiro (a grade inteira usa a
 *   mesma linha de catálogo — pt ou en, spec §2 / regra 7 do AGENTS.md).
 * - Precisa de pelo menos 1 item.
 * - Cada item precisa de `cartaId`, `quantidade` inteira >= 1, `variante`,
 *   `idioma` (físico) e `condicao` válidos. `localizacao` é opcional.
 * - `idioma` (físico) do item é livre em relação a `idiomaCatalogo` — é
 *   exatamente o ponto da regra 7: a cópia pode ser `pt` sobre uma linha
 *   de catálogo `en`.
 */
export function validarLoteCopias(
  bruto: LoteCopiasBruto,
): ResultadoValidacaoLote {
  const erros: ErroItemLote[] = [];

  if (!ehIdioma(bruto.idiomaCatalogo)) {
    erros.push({
      indice: -1,
      cartaId: null,
      motivo: `idiomaCatalogo inválido ou ausente: ${String(bruto.idiomaCatalogo)}`,
    });
  }

  const itens = Array.isArray(bruto.itens) ? bruto.itens : null;
  if (!itens) {
    erros.push({ indice: -1, cartaId: null, motivo: "itens deve ser um array" });
  } else if (itens.length === 0) {
    erros.push({
      indice: -1,
      cartaId: null,
      motivo: "nenhuma carta marcada — o lote precisa de ao menos 1 item",
    });
  }

  if (erros.length > 0 || !itens) {
    return { ok: false, erros };
  }

  const copias: CopiaParaInserir[] = [];
  itens.forEach((itemBruto, indice) => {
    const item = itemBruto as ItemLoteBruto;
    const cartaId =
      typeof item.cartaId === "string" && item.cartaId.trim() !== ""
        ? item.cartaId
        : null;

    if (!cartaId) {
      erros.push({ indice, cartaId: null, motivo: "cartaId ausente ou vazio" });
      return;
    }
    if (
      typeof item.quantidade !== "number" ||
      !Number.isInteger(item.quantidade) ||
      item.quantidade < 1
    ) {
      erros.push({
        indice,
        cartaId,
        motivo: `quantidade inválida: ${String(item.quantidade)} (precisa ser inteiro >= 1)`,
      });
      return;
    }
    if (!ehVarianteCopia(item.variante)) {
      erros.push({
        indice,
        cartaId,
        motivo: `variante inválida: ${String(item.variante)}`,
      });
      return;
    }
    if (!ehIdioma(item.idioma)) {
      erros.push({
        indice,
        cartaId,
        motivo: `idioma inválido: ${String(item.idioma)}`,
      });
      return;
    }
    if (!ehCondicao(item.condicao)) {
      erros.push({
        indice,
        cartaId,
        motivo: `condicao inválida: ${String(item.condicao)}`,
      });
      return;
    }
    const localizacao =
      typeof item.localizacao === "string" && item.localizacao.trim() !== ""
        ? item.localizacao
        : null;

    copias.push({
      cartaId,
      idiomaCatalogo: bruto.idiomaCatalogo as Idioma,
      idioma: item.idioma,
      variante: item.variante,
      quantidade: item.quantidade,
      condicao: item.condicao,
      localizacao,
    });
  });

  if (erros.length > 0) {
    return { ok: false, erros };
  }

  return {
    ok: true,
    idiomaCatalogo: bruto.idiomaCatalogo as Idioma,
    copias,
  };
}
