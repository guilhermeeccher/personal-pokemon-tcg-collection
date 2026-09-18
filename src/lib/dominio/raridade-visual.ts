/**
 * Classificação visual da raridade.
 *
 * A raridade no catálogo é **texto livre vindo do upstream**, em dois
 * idiomas, com 56 valores distintos hoje ("Common", "Comum", "Rara Holo
 * VMAX", "Ilustração Rara Especial", "ACE SPEC Raro"…). O design system,
 * por outro lado, desenhou só cinco glifos.
 *
 * Este módulo faz a ponte, e só ela: reduz o texto livre a um dos cinco
 * baldes **para escolher glifo e cor**. O rótulo exibido continua sendo a
 * string original, sem tradução — mapear 56 em 5 na exibição perderia
 * informação que o usuário usa.
 *
 * Ordem de teste importa, e é a parte fácil de errar:
 * - "Incomum" contém "comum"; "Uncommon" contém "common" — os incomuns
 *   são testados antes.
 * - "Rara Holo" e "Ultra Rara" contêm "rara" — holo e secreta são
 *   testados antes da rara simples.
 * O que não casar com nada cai em `comum` (cinza), nunca em chute.
 */

export const CLASSES_RARIDADE = ["comum", "incomum", "rara", "holo", "secreta"] as const;
export type ClasseRaridade = (typeof CLASSES_RARIDADE)[number];

/** Minúsculas e sem acento, para comparar "Ilustração" com "ilustracao". */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/* Cada regra é [classe, marcadores]. A primeira que casar vence, então a
   ordem desta lista É a regra de desempate descrita no cabeçalho. */
const REGRAS: readonly (readonly [ClasseRaridade, readonly string[]])[] = [
  // "Sem raridade" existe de verdade no catálogo (2.649 cartas). Não é uma
  // falha de classificação: é ausência de raridade, e fica cinza como a comum.
  ["comum", ["none", "sem raridade"]],
  [
    "secreta",
    [
      "secreta",
      "secret",
      "hyper",
      "hiper",
      "ultra",
      "ilustracao",
      "illustration",
      "ace spec",
      "character",
      "legend",
      "full art",
      "arte completa",
    ],
  ],
  [
    "holo",
    [
      "holo",
      "dupla",
      "double",
      "triple",
      "radiant",
      "radiante",
      "shiny",
      "brilhante",
      "prime",
      "lv.x",
      "vmax",
      "vstar",
      "amazing",
      "incriveis",
      "classic",
      "preto e branco",
      "black white",
    ],
  ],
  ["incomum", ["incomum", "uncommon"]],
  ["comum", ["comum", "common"]],
  ["rara", ["rara", "raro", "rare"]],
];

/**
 * Reduz a raridade de texto livre a uma das cinco classes visuais.
 * `null`/vazio e qualquer valor desconhecido caem em `comum`.
 */
export function classificarRaridade(raridade: string | null | undefined): ClasseRaridade {
  if (!raridade) return "comum";
  const alvo = normalizar(raridade);
  for (const [classe, marcadores] of REGRAS) {
    if (marcadores.some((m) => alvo.includes(m))) return classe;
  }
  return "comum";
}
