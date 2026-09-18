/**
 * Elegibilidade de uma cópia para preencher uma vaga (spec §3.3, §4;
 * AGENTS.md regras 1, 2, 3, 5, 7 — parte B da Fase 2).
 *
 * Duas perguntas independentes, respondidas em sequência:
 *
 * 1. A carta da cópia pertence ao UNIVERSO da vaga? (`pertenceAoUniversoDaVaga`)
 *    - `pokedex`: exige exatamente um `dexId`, igual à chave da vaga
 *      (regra 2 — tag team e carta multi-Pokémon são inelegíveis, sem
 *      exceção e sem opção de forçar). A FORMA nunca é critério de
 *      recusa (regra 3): Raichu de Alola e Raichu disputam a vaga 26
 *      porque ambos têm `dexIds = [26]` — este módulo nem recebe a
 *      forma como entrada, de propósito, então não há como ela virar
 *      critério de recusa.
 *    - `set`: exige que a carta seja daquele `local_id` naquele set.
 *      Comparado por identidade da carta (`setId`/`localId`, resolvidos
 *      por quem chama a partir do par (cartaId, idiomaCatalogo) da
 *      própria cópia — ver `lib/db/consultas.ts`), nunca pelo idioma de
 *      catálogo da vaga: uma cópia identificada pela linha `en` do
 *      catálogo entra numa coleção de set renderizada em `pt` sem
 *      atrito (AGENTS.md regra 7) — 33 sets não têm carta a carta em pt
 *      e existem cartas físicas brasileiras desses sets.
 *    - `customizada`: qualquer cópia serve, sem universo fixo.
 *
 * 2. A cópia respeita o `idiomaExigido` da coleção? (`ehForaDePadrao`)
 *    Refere-se ao idioma FÍSICO da cópia (`copia.idioma`), nunca ao
 *    `idiomaCatalogo` — o idioma de catálogo responde "que carta é
 *    esta", o idioma físico responde "como é a minha" (AGENTS.md regra
 *    7). Cópia de outro idioma físico é recusada por padrão, mas pode
 *    ser aceita com o sinalizador explícito `permitirForaDePadrao` —
 *    nunca entra por acidente (spec §3.3: "sugestão fora de padrão").
 *
 * A regra 5 (a seleção é sempre do usuário) não é deste módulo: aqui só
 * se decide SE uma alocação é permitida, nunca se ela deve acontecer —
 * quem decide oferecer ou executar é a camada acima.
 *
 * Módulo puro, sem I/O — quem chama já resolveu carta/cópia/vaga contra
 * o banco e passa por argumento.
 */

import type { Idioma } from "./enums";
import type { ParametroPokedex, ParametroSet, TipoColecao } from "./parametro-colecao";

export interface InfoVagaParaElegibilidade {
  tipo: TipoColecao;
  /** Número da Pokédex (pokedex) ou `local_id` (set), como texto. */
  chave: string;
  parametro: ParametroPokedex | ParametroSet | null;
  idiomaExigido: Idioma | null;
}

/** Dados da carta de catálogo que identifica a cópia — idioma-invariantes. */
export interface InfoCartaParaElegibilidade {
  setId: string;
  localId: string;
  /** Array de dexIds da carta. Vazio para Treinador/Energia. */
  dexIds: readonly number[];
}

export interface InfoCopiaParaElegibilidade {
  /** Idioma FÍSICO da cópia — nunca o idiomaCatalogo. */
  idioma: Idioma;
}

export interface OpcoesElegibilidade {
  /** Autoriza explicitamente uma cópia fora do idiomaExigido da coleção. */
  permitirForaDePadrao?: boolean;
}

export type ResultadoUniverso = { ok: true } | { ok: false; motivo: string };

export type ResultadoElegibilidade =
  | { elegivel: true; foraDePadrao: boolean }
  | { elegivel: false; motivo: string };

/** Regra 2 (Pokédex) + regra 3 (forma nunca desdobra a vaga). */
function pertenceAoUniversoPokedex(
  chave: string,
  dexIds: readonly number[],
): ResultadoUniverso {
  if (dexIds.length !== 1) {
    return {
      ok: false,
      motivo:
        dexIds.length === 0
          ? "Carta sem número de Pokédex (Treinador/Energia) não ocupa vaga de Pokédex."
          : "Carta com mais de um número de Pokédex (tag team / carta multi-Pokémon) não ocupa vaga de Pokédex — inelegível sem exceção.",
    };
  }
  const numeroVaga = Number(chave);
  if (dexIds[0] !== numeroVaga) {
    return {
      ok: false,
      motivo: `Esta carta é do Pokémon nº ${dexIds[0]}; a vaga é do nº ${numeroVaga}.`,
    };
  }
  return { ok: true };
}

/** Set: mesma carta (setId + localId), por identidade — nunca por idioma de catálogo. */
function pertenceAoUniversoSet(
  chave: string,
  parametro: ParametroSet,
  carta: InfoCartaParaElegibilidade,
): ResultadoUniverso {
  if (carta.setId !== parametro.setId) {
    return {
      ok: false,
      motivo: `Esta carta é do set '${carta.setId}'; a vaga é do set '${parametro.setId}'.`,
    };
  }
  if (carta.localId !== chave) {
    return {
      ok: false,
      motivo: `Esta carta é o número '${carta.localId}' do set; a vaga é o número '${chave}'.`,
    };
  }
  return { ok: true };
}

export function pertenceAoUniversoDaVaga(
  vaga: InfoVagaParaElegibilidade,
  carta: InfoCartaParaElegibilidade,
): ResultadoUniverso {
  switch (vaga.tipo) {
    case "pokedex":
      return pertenceAoUniversoPokedex(vaga.chave, carta.dexIds);
    case "set":
      return pertenceAoUniversoSet(vaga.chave, vaga.parametro as ParametroSet, carta);
    case "customizada":
      return { ok: true };
  }
}

/** `idiomaExigido` da coleção refere-se ao idioma FÍSICO da cópia. */
export function ehForaDePadrao(
  idiomaExigido: Idioma | null,
  idiomaFisicoCopia: Idioma,
): boolean {
  return idiomaExigido !== null && idiomaFisicoCopia !== idiomaExigido;
}

/**
 * Decide se a cópia pode preencher a vaga. Combina as duas perguntas
 * acima: primeiro o universo (regras 2/3/7), depois o idioma exigido —
 * fora de padrão sem `permitirForaDePadrao` é recusado, com o
 * sinalizador é aceito e vem marcado `foraDePadrao: true`.
 */
export function avaliarElegibilidade(
  vaga: InfoVagaParaElegibilidade,
  carta: InfoCartaParaElegibilidade,
  copia: InfoCopiaParaElegibilidade,
  opcoes: OpcoesElegibilidade = {},
): ResultadoElegibilidade {
  const universo = pertenceAoUniversoDaVaga(vaga, carta);
  if (!universo.ok) {
    return { elegivel: false, motivo: universo.motivo };
  }

  const foraDePadrao = ehForaDePadrao(vaga.idiomaExigido, copia.idioma);
  if (foraDePadrao && !opcoes.permitirForaDePadrao) {
    return {
      elegivel: false,
      motivo: `Esta coleção exige cópias em '${vaga.idiomaExigido}'; esta cópia é em '${copia.idioma}'. Envie permitirForaDePadrao para aceitar mesmo assim.`,
    };
  }

  return { elegivel: true, foraDePadrao };
}
