/**
 * Sugestão de melhoria: quando uma cópia LIVRE do inventário é melhor do
 * que a cópia já alocada numa vaga (spec §5, Fase 9).
 *
 * Por que existe: o sistema já sabia dizer o que FALTA (regra 6), mas era
 * cego para o que já está lá e podia estar melhor. O caso que originou a
 * feature é real: um Ampharos `CRI 90/86` (secreta) solto no inventário
 * enquanto a vaga 181 da Pokédex está ocupada por um Ampharos comum. Nada no sistema falava sobre isso.
 *
 * **A escada, decidida em 2026-09-05, é uma só e vale para os
 * dois tipos de coleção:**
 *
 * 1. **Raridade** — peso 1, o critério que manda.
 * 2. **Idioma** físico da cópia — `en` > `jp` > `pt`.
 * 3. **Variante** — `normal` < `reverse` < `holo` < `1ª edição`.
 *
 * O que muda entre os tipos é o UNIVERSO comparado, não a escada:
 * - `pokedex`: a vaga é uma espécie, então concorre qualquer carta dela,
 *   de qualquer set — é aí que a raridade decide de verdade.
 * - `set`: a vaga é uma carta específica (mesmo `set_id` + `local_id`),
 *   então raridade e idioma de catálogo empatam por construção e quem
 *   decide é a variante — o caso "tenho a normal alocada e uma reverse
 *   livre" que motivou a feature.
 *
 * **`promo` fica fora da escada** (decisão da mesma data): não é um
 * degrau acima nem abaixo das outras variantes, é outra impressão. Cópia
 * promo nunca é sugerida como melhoria e vaga preenchida com promo nunca
 * é sinalizada para troca — nos dois sentidos o silêncio é deliberado,
 * não um esquecimento.
 *
 * **Condição (NM/LP/MP/HP/DMG) não é critério**, também por decisão:
 * uma secreta DMG vence uma comum NM. A condição aparece na tela em toda
 * candidata, então a troca ruim é visível antes do clique — e a escolha
 * segue sendo do usuário (regra 5).
 *
 * Módulo puro, sem I/O: quem chama (`listarMelhoriasDaColecao`, em
 * `lib/db/consultas.ts`) já resolveu os pares (vaga preenchida × cópia
 * livre do mesmo universo) contra o banco. O SQL faz o casamento; a
 * ESCADA é só daqui — nunca reimplementada em `CASE` no meio de uma
 * consulta, onde ninguém a testaria.
 */

import type { Idioma, VarianteCopia } from "./enums";
import { CLASSES_RARIDADE, classificarRaridade } from "./raridade-visual";

/**
 * Idioma da carta física, do pior para o melhor. A ordem decidida:
 * inglês primeiro, japonês depois, português por último.
 *
 * Nada aqui julga a língua — é preferência de coleção, declarada.
 */
export const ORDEM_IDIOMA: readonly Idioma[] = ["pt", "jp", "en"];

/**
 * Variantes que formam escada, do pior para o melhor. `promo` está
 * ausente DE PROPÓSITO — ver o cabeçalho. Não acrescente `promo` aqui
 * sem uma decisão explícita: entraria como "melhor que 1ª edição", que é
 * exatamente o que foi recusado.
 */
export const ORDEM_VARIANTE: readonly VarianteCopia[] = [
  "normal",
  "reverse",
  "holo",
  "primeira_edicao",
];

/** Os três eixos, na ordem em que desempatam. */
export const EIXOS_MELHORIA = ["raridade", "idioma", "variante"] as const;
export type EixoMelhoria = (typeof EIXOS_MELHORIA)[number];

/** O mínimo que a escada precisa saber de uma cópia. */
export interface CopiaComparavel {
  /** Raridade da carta de catálogo que identifica a cópia (texto livre). */
  raridade: string | null;
  /** Idioma FÍSICO da cópia (AGENTS.md regra 7), nunca o de catálogo. */
  idioma: Idioma;
  variante: VarianteCopia;
}

/** Posição em cada eixo — quanto maior, melhor. */
export interface PontuacaoMelhoria {
  raridade: number;
  idioma: number;
  variante: number;
}

/**
 * Pontua uma cópia nos três eixos, ou devolve `null` quando ela está
 * FORA da escada (hoje só `promo`). `null` é resposta legítima e
 * silenciosa: quem recebe não compara, não sugere e não sinaliza.
 *
 * A raridade reusa `classificarRaridade` — as mesmas cinco classes que
 * já governam glifo e cor na tela. Isso é deliberado: se a escada usasse
 * uma segunda classificação própria, a tela mostraria o glifo de
 * "secreta" e a sugestão diria que é igual, e o sistema pareceria mentir.
 */
export function pontuarCopia(copia: CopiaComparavel): PontuacaoMelhoria | null {
  const variante = ORDEM_VARIANTE.indexOf(copia.variante);
  if (variante < 0) return null;

  return {
    raridade: CLASSES_RARIDADE.indexOf(classificarRaridade(copia.raridade)),
    idioma: ORDEM_IDIOMA.indexOf(copia.idioma),
    variante,
  };
}

/**
 * Primeiro eixo em que a candidata supera a alocada, ou `null` quando
 * não supera em nenhum (ou quando alguma das duas está fora da escada).
 *
 * É lexicográfico, não somatório: raridade é peso 1 e não pode ser
 * compensada por idioma nem por variante. Uma comum inglesa jamais vence
 * uma secreta portuguesa — se somasse pontos, venceria.
 *
 * Perder num eixo mais alto encerra a comparação: candidata de raridade
 * MENOR não é melhoria por ser inglesa.
 */
export function eixoDaMelhoria(
  alocada: CopiaComparavel,
  candidata: CopiaComparavel,
): EixoMelhoria | null {
  const a = pontuarCopia(alocada);
  const c = pontuarCopia(candidata);
  if (!a || !c) return null;

  for (const eixo of EIXOS_MELHORIA) {
    if (c[eixo] > a[eixo]) return eixo;
    if (c[eixo] < a[eixo]) return null;
  }
  return null;
}

/** `true` quando a candidata é estritamente melhor. Empate nunca sugere. */
export function ehMelhoria(alocada: CopiaComparavel, candidata: CopiaComparavel): boolean {
  return eixoDaMelhoria(alocada, candidata) !== null;
}

/**
 * Ordena candidatas da melhor para a pior — a mesma escada, aplicada
 * entre elas. Empate mantém a ordem de entrada (`sort` estável no V8),
 * que é a do banco; não invento desempate onde a regra não tem nenhum.
 */
export function ordenarCandidatas<T extends CopiaComparavel>(candidatas: readonly T[]): T[] {
  return candidatas.slice().sort((x, y) => {
    const px = pontuarCopia(x);
    const py = pontuarCopia(y);
    if (!px || !py) return 0;
    for (const eixo of EIXOS_MELHORIA) {
      if (py[eixo] !== px[eixo]) return py[eixo] - px[eixo];
    }
    return 0;
  });
}

/**
 * Filtra e ordena, numa passada: as candidatas que são melhoria de fato,
 * da melhor para a pior, cada uma com o eixo que a fez ganhar.
 *
 * Devolver o eixo é o que permite a tela dizer POR QUE aquilo apareceu
 * ("sobe de rara para secreta") em vez de exibir uma sugestão sem
 * justificativa — que é como uma sugestão vira ruído e ele para de olhar.
 */
export function selecionarMelhorias<T extends CopiaComparavel>(
  alocada: CopiaComparavel,
  candidatas: readonly T[],
): (T & { eixo: EixoMelhoria })[] {
  const melhorias = candidatas
    .map((c) => {
      const eixo = eixoDaMelhoria(alocada, c);
      return eixo ? { ...c, eixo } : null;
    })
    .filter((c): c is T & { eixo: EixoMelhoria } => c !== null);

  return ordenarCandidatas(melhorias);
}

/**
 * Texto da tooltip do botão de melhoria, irmão de `rotuloAlocacao`
 * (`lib/dominio/alocacao-disponivel.ts`) — a mesma frase curta que
 * explica o botão antes do clique, no mesmo lugar da vaga.
 */
export function rotuloMelhoria(candidatas: number): string {
  if (candidatas <= 0) return "Nenhuma cópia livre sua é melhor que esta.";
  if (candidatas === 1) return "1 cópia livre sua é melhor que a alocada aqui.";
  return `${candidatas} cópias livres suas são melhores que a alocada aqui.`;
}
