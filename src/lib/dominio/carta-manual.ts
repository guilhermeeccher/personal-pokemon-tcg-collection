/**
 * Validação da carta cadastrada à mão pelo usuário, para os casos em
 * que a TCGdex não tem a carta em fonte nenhuma.
 *
 * **Por que existe (2026-08-26).** Ele tem um Charmander do set `SMH`
 * (GX Starter Decks japonês, 131 cartas) — set que a TCGdex não
 * catalogou: não está no repositório de dados, não está na lista de 184
 * sets japoneses da API, não está em lugar nenhum. E não é caso isolado:
 * há 68 sets japoneses sem carta a carta e os sets em português na mesma
 * situação. Sem linha de catálogo, a carta não pode nem ser cadastrada.
 *
 * A linha criada aqui entra na própria `carta_catalogo`, marcada com
 * `origem = 'manual'` — ver o comentário da coluna no schema para o
 * porquê.
 */

import {
  type Idioma,
  ehIdioma,
} from "./enums";
import { type Recusa, recusa } from "./recusa";

export interface CartaManualBruta {
  setId?: unknown;
  setNome?: unknown;
  localId?: unknown;
  nome?: unknown;
  idioma?: unknown;
  /** Número da Pokédex. Só para Pokémon; ausente em Treinador/Energia. */
  dexId?: unknown;
  raridade?: unknown;
  /** Total impresso na carta ("011/131" → 131). Vira o tamanho do set. */
  qtdSet?: unknown;
}

export interface CartaManualValida {
  setId: string;
  setNome: string;
  localId: string;
  nome: string;
  idioma: Idioma;
  dexIds: number[];
  raridade: string | null;
  qtdSet: number | null;
}

/* Os erros saem como RECUSA (chave + valores), não como frase: esta é
   a única validação cuja lista inteira aparece na tela, item a item, e
   ela tem que aparecer no idioma da interface — ver `recusa.ts`. */
export type ResultadoCartaManual =
  | { ok: true; carta: CartaManualValida }
  | { ok: false; erros: Recusa[] };

/** Maior número da Pokédex Nacional hoje (Geração 9). */
const DEX_MAXIMO = 1025;

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function validarCartaManual(
  bruto: CartaManualBruta,
): ResultadoCartaManual {
  const erros: Recusa[] = [];

  const setId = texto(bruto.setId);
  const localId = texto(bruto.localId);
  const nome = texto(bruto.nome);
  const setNome = texto(bruto.setNome);

  if (!setId) erros.push(recusa("informeSiglaDoSet"));
  if (!localId) erros.push(recusa("informeNumeroDaCarta"));
  if (!nome) erros.push(recusa("informeNomeDaCarta"));

  const idiomaBruto = texto(bruto.idioma);
  let idioma: Idioma | undefined;
  if (!idiomaBruto) {
    erros.push(recusa("informeIdiomaDoCatalogo"));
  } else if (!ehIdioma(idiomaBruto)) {
    erros.push(recusa("idiomaInvalido", { idioma: idiomaBruto }));
  } else {
    idioma = idiomaBruto;
  }

  // Pokédex é opcional — Treinador e Energia não têm. Mas se vier, tem
  // que ser um número real: uma vaga de Pokédex materializada a partir de
  // um número inventado seria pior que a ausência da carta.
  const dexIds: number[] = [];
  if (bruto.dexId !== undefined && bruto.dexId !== null && bruto.dexId !== "") {
    const n = Number(bruto.dexId);
    if (!Number.isInteger(n) || n < 1 || n > DEX_MAXIMO) {
      erros.push(
        recusa("numeroPokedexInvalido", {
          maximo: String(DEX_MAXIMO),
          valor: String(bruto.dexId),
        }),
      );
    } else {
      dexIds.push(n);
    }
  }

  let qtdSet: number | null = null;
  if (bruto.qtdSet !== undefined && bruto.qtdSet !== null && bruto.qtdSet !== "") {
    const n = Number(bruto.qtdSet);
    if (!Number.isInteger(n) || n < 1) {
      erros.push(recusa("totalDeCartasDoSetInvalido", { valor: String(bruto.qtdSet) }));
    } else {
      qtdSet = n;
    }
  }

  if (erros.length > 0) return { ok: false, erros };

  return {
    ok: true,
    carta: {
      setId: setId!,
      // Sem nome de set informado, usa a própria sigla: é o que ele tem
      // impresso na carta, e é melhor que um rótulo vazio na tela.
      setNome: setNome ?? setId!,
      localId: localId!,
      nome: nome!,
      idioma: idioma!,
      dexIds,
      raridade: texto(bruto.raridade) ?? null,
      qtdSet,
    },
  };
}

/**
 * Id da linha de catálogo, no mesmo formato do upstream (`SMH-011`).
 *
 * Deliberadamente **sem** prefixo de "manual": se um dia a TCGdex
 * catalogar o set, o sync passa a atualizar exatamente esta linha, e a
 * cópia do usuário herda os dados oficiais sem nenhuma migração. O
 * campo `origem` continua dizendo quem a criou.
 */
export function idCartaManual(setId: string, localId: string): string {
  return `${setId}-${localId}`;
}
