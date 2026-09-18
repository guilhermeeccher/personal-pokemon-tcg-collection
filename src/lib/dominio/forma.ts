/**
 * Normalização de forma a partir do nome da carta (spec §3.1, §9).
 *
 * `forma` não vem estruturada da API TCGdex — é derivada por casamento de
 * padrão textual no nome, em pt e en. Nome que não casar com nenhum padrão
 * vira `normal`. **Nunca chuta**: um padrão só entra aqui quando confirmado
 * contra nomes reais da API (ver relatório da Fase 0 para o que foi
 * verificado e o que ficou de fora por falta de evidência textual).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

export type Forma =
  | "normal"
  | "alola"
  | "galar"
  | "hisui"
  | "paldea"
  | "mega"
  | "gigantamax";

interface PadraoForma {
  forma: Exclude<Forma, "normal">;
  padrao: RegExp;
}

// Ordem: formas regionais primeiro, depois mega/gigantamax. Não há hoje
// nenhum nome real que dispute mais de um padrão, mas a ordem fixa a
// prioridade caso isso mude.
const PADROES: readonly PadraoForma[] = [
  // en: "Alolan Raichu" · pt: "Raichu de Alola"
  { forma: "alola", padrao: /\bAlolan\b|\bde Alola\b/i },
  // en: "Galarian Darmanitan" · pt: "Darmanitan de Galar"
  { forma: "galar", padrao: /\bGalarian\b|\bde Galar\b/i },
  // en: "Hisuian Voltorb" · pt: "Voltorb de Hisui"
  { forma: "hisui", padrao: /\bHisuian\b|\bde Hisui\b/i },
  // en: "Paldean Tauros" · pt: "Tauros de Paldea"
  { forma: "paldea", padrao: /\bPaldean\b|\bde Paldea\b/i },
  // Sem ocorrência confirmada no catálogo TCGdex atual (0 cartas em pt/en
  // contêm literalmente "Gigantamax" no nome — cartas VMAX não usam essa
  // palavra). Regra fica pronta para o dia em que a API tiver esse nome;
  // até lá, nunca casa, e nunca é inferida a partir de "VMAX" sozinho.
  { forma: "gigantamax", padrao: /\bGigantamax\b|\bde Gigantamax\b/i },
  // "Mega X" (case-sensitive): distingue de espécies cujo nome só contém
  // a substring "mega" em minúsculo, como "Yanmega" e "Meganium".
  // Não cobre o formato legado "M Charizard EX" (era XY) — nome só com
  // "M " não tem sinal textual suficiente para casar com segurança; vira
  // "normal" (gap conhecido, ver relatório).
  { forma: "mega", padrao: /\bMega\b/ },
];

/** Deriva a forma da carta a partir do nome. Nunca lança; sempre retorna algo. */
export function derivarForma(nomeCarta: string): Forma {
  for (const { forma, padrao } of PADROES) {
    if (padrao.test(nomeCarta)) return forma;
  }
  return "normal";
}
