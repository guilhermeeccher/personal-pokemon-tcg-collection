/**
 * Edição em massa no inventário (item 2 do incremento pós-Fase 3):
 * selecionar várias cópias e aplicar uma alteração de uma vez.
 *
 * Campos editáveis em massa são deliberadamente um SUBCONJUNTO dos
 * editáveis em `validarEdicaoCopia` (copia.ts): condição, localização,
 * idioma FÍSICO e variante. Fora disso por decisão explícita da tarefa:
 * - `quantidade`, `graded*`, `aquisicao*` e `notas` não entram — não faz
 *   sentido gravar o MESMO valor em várias cópias de uma vez (preço
 *   pago, certificado de grading, notas são por exemplar).
 * - `idiomaCatalogo` nunca é editável, aqui ou em qualquer lugar —
 *   identidade da carta, não "como é a minha" (regra 7).
 * - A edição em massa NUNCA mexe em alocação: este módulo nem sabe o
 *   que é uma vaga. Quem chama (lib/db/consultas.ts) só faz UPDATE na
 *   tabela `copia`.
 *
 * Reaproveita os mesmos validadores de enum de `enums.ts` usados por
 * `copia.ts` — não reimplementa "o que é uma condição/idioma/variante
 * válida".
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
import { ehUuid } from "./uuid";

export interface PatchEdicaoMassa {
  condicao?: Condicao;
  localizacao?: string | null;
  /** Idioma FÍSICO da cópia — nunca idiomaCatalogo (regra 7). */
  idioma?: Idioma;
  variante?: VarianteCopia;
}

export interface EdicaoMassaBruta {
  copiaIds?: unknown;
  patch?: unknown;
}

export interface EdicaoMassaValida {
  copiaIds: string[];
  patch: PatchEdicaoMassa;
}

export type ResultadoValidacaoEdicaoMassa =
  | { ok: true; edicao: EdicaoMassaValida }
  | { ok: false; erros: string[] };

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const CAMPOS_PERMITIDOS = ["condicao", "localizacao", "idioma", "variante"] as const;

export function validarEdicaoEmMassa(bruto: EdicaoMassaBruta): ResultadoValidacaoEdicaoMassa {
  const erros: string[] = [];

  const copiaIdsBruto = Array.isArray(bruto.copiaIds) ? bruto.copiaIds : null;
  if (!copiaIdsBruto || copiaIdsBruto.length === 0) {
    erros.push("copiaIds ausente ou vazio — selecione ao menos uma cópia.");
  }
  const copiaIds: string[] = [];
  if (copiaIdsBruto) {
    const vistos = new Set<string>();
    for (const id of copiaIdsBruto) {
      if (typeof id !== "string" || !ehUuid(id)) {
        erros.push(`copiaIds contém um id inválido: ${String(id)}`);
        continue;
      }
      if (!vistos.has(id)) {
        vistos.add(id);
        copiaIds.push(id);
      }
    }
  }

  const patchBruto =
    typeof bruto.patch === "object" && bruto.patch !== null
      ? (bruto.patch as Record<string, unknown>)
      : {};

  const camposDesconhecidos = Object.keys(patchBruto).filter(
    (c) => !(CAMPOS_PERMITIDOS as readonly string[]).includes(c),
  );
  if (camposDesconhecidos.length > 0) {
    erros.push(
      `patch contém campo(s) não editável(is) em massa: ${camposDesconhecidos.join(", ")}. ` +
        `Editáveis: ${CAMPOS_PERMITIDOS.join(", ")}.`,
    );
  }

  const patch: PatchEdicaoMassa = {};
  if (patchBruto.condicao !== undefined) {
    if (!ehCondicao(patchBruto.condicao)) {
      erros.push(`condicao inválida: ${String(patchBruto.condicao)}`);
    } else {
      patch.condicao = patchBruto.condicao;
    }
  }
  if (patchBruto.localizacao !== undefined) {
    patch.localizacao = textoOpcional(patchBruto.localizacao);
  }
  if (patchBruto.idioma !== undefined) {
    if (!ehIdioma(patchBruto.idioma)) {
      erros.push(`idioma inválido: ${String(patchBruto.idioma)}`);
    } else {
      patch.idioma = patchBruto.idioma;
    }
  }
  if (patchBruto.variante !== undefined) {
    if (!ehVarianteCopia(patchBruto.variante)) {
      erros.push(`variante inválida: ${String(patchBruto.variante)}`);
    } else {
      patch.variante = patchBruto.variante;
    }
  }

  if (Object.keys(patch).length === 0 && camposDesconhecidos.length === 0) {
    erros.push(
      `patch vazio — informe ao menos um campo (${CAMPOS_PERMITIDOS.join(", ")}).`,
    );
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, edicao: { copiaIds, patch } };
}
