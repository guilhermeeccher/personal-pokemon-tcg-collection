/**
 * A identidade de uma carta na **LigaPokemon** — sigla da edição, número e
 * total — quando ela difere do que o nosso catálogo (TCGdex) grava.
 * Módulo puro.
 *
 * Para quase todo set a Liga e o catálogo concordam: a sigla é a mesma, o
 * número é o `local_id` e o total é `set_qtd_oficial` (ver
 * `exportacao-liga.ts`). Este módulo existe para as exceções, e hoje há uma.
 *
 * ## A Coleção Clássica de 30 Anos (`30th-c`)
 *
 * O TCGdex lista as 30 reimpressões clássicas como um set à parte, numeradas
 * `001`–`030` na ordem dele, com `set_sigla = 30C` — a **mesma** sigla do set
 * principal (`30th`) — e `set_qtd_oficial = 0`. A Liga trata o conjunto como
 * outra edição: sigla `30C-C`, total 30, e o número de cada carta é o número
 * **impresso na carta original** (a Delcatty clássica é `005/30` porque a
 * carta original é a 5/109; no nosso catálogo ela é `30th-c-002`).
 * Medido em 2026-10-05 com uma busca real por Delcatty.
 *
 * Sem a exceção, o export mandava `30C` + `001` + `000` (a Liga não
 * reconhece), e o casamento de uma linha da Liga `30C` + `005` caía em duas
 * cartas ao mesmo tempo: `30th-005` e a Misty clássica `30th-c-005`.
 *
 * A tabela mora aqui e **não no catálogo**: o sync sobrescreveria qualquer
 * correção feita lá.
 */

export interface IdentidadeLiga {
  /** Sigla da edição como a Liga escreve. Nula quando o catálogo não tem. */
  sigla: string | null;
  /** Número como a Liga escreve: o `local_id` do catálogo, salvo exceção. */
  numero: string;
  /** Total da edição. `null` quando o catálogo não traz contagem. */
  total: number | null;
}

export interface CartaParaIdentidadeLiga {
  setId: string;
  localId: string;
  setSigla: string | null;
  setQtdOficial: number | null;
}

interface ExcecaoSet {
  sigla: string;
  total: number;
  /** `local_id` do catálogo → número impresso na carta original. */
  numeroPorLocalId: Readonly<Record<string, string>>;
}

/**
 * Número original das 30 clássicas, lido das URLs de imagem
 * (`pokemon_30cc_<num>_<total>`). Os repetidos (011 ×2, 106 ×3) a Liga
 * distingue pelo nome; as duas Darkrai & Cresselia LEGEND são 099 e 100.
 */
const CLASSICAS_30_ANOS: Readonly<Record<string, string>> = {
  "001": "004", // Charizard
  "002": "005", // Delcatty
  "003": "011", // Metagross
  "004": "011", // Genesect EX
  "005": "018", // Misty
  "006": "019", // Dark Tyranitar
  "007": "025", // Sneasel
  "008": "033", // Pikachu & Zekrom GX
  "009": "041", // Greninja BREAK
  "010": "043", // Uxie
  "011": "047", // Crobat G
  "012": "050", // Raikou
  "013": "057", // Buzzwole GX
  "014": "058", // Pikachu
  "015": "069", // Erika's Jigglypuff
  "016": "085", // Rayquaza EX
  "017": "089", // Solgaleo GX
  "018": "094", // Gengar
  "019": "099", // Darkrai & Cresselia LEGEND
  "020": "100", // Darkrai & Cresselia LEGEND
  "021": "101", // N
  "022": "106", // Palkia
  "023": "106", // M Gardevoir EX
  "024": "106", // Shining Celebi
  "025": "108", // Scizor ex
  "026": "114", // Mew VMAX
  "027": "123", // Arceus VSTAR
  "028": "138", // Zacian V
  "029": "149", // Lugia
  "030": "203", // Magikarp
};

const EXCECOES: Readonly<Record<string, ExcecaoSet>> = {
  "30th-c": { sigla: "30C-C", total: 30, numeroPorLocalId: CLASSICAS_30_ANOS },
};

/**
 * A identidade da carta na Liga. Set fora da tabela de exceções (e carta
 * sem entrada na tabela do set excepcional) sai exatamente como o catálogo
 * a grava — nunca um palpite.
 */
export function identidadeNaLiga(carta: CartaParaIdentidadeLiga): IdentidadeLiga {
  const excecao = EXCECOES[carta.setId.toLowerCase()];
  const numero = excecao?.numeroPorLocalId[carta.localId.trim()];
  if (excecao && numero !== undefined) {
    return { sigla: excecao.sigla, numero, total: excecao.total };
  }
  return {
    sigla: carta.setSigla,
    numero: carta.localId,
    total: carta.setQtdOficial,
  };
}

/**
 * Os `set_id` do catálogo que a Liga publica sob esta sigla de exceção — para
 * a busca de candidatas ao casar uma linha da Liga com o catálogo: `30C-C`
 * não é sigla de nenhum set nosso, então só a tabela sabe a que set aponta.
 */
export function setIdsDaSiglaLiga(sigla: string): string[] {
  const alvo = sigla.trim().toUpperCase();
  return Object.entries(EXCECOES)
    .filter(([, e]) => e.sigla.toUpperCase() === alvo)
    .map(([setId]) => setId);
}
