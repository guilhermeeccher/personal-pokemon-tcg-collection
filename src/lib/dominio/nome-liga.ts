/**
 * O nome de uma carta como a **LigaPokemon** o escreve, a partir do nome em
 * inglês do nosso catálogo. Módulo puro.
 *
 * ## Por que existe
 *
 * Desde 2026-11-11 a busca da Liga barra o coletor (403 do firewall de
 * borda), e a lista de compras passou a nascer do catálogo, não da busca
 * deles (`candidatas-compra.ts`). A linha que vai para a Compra por Lista é
 * `1 <nome> (<número>/<total>)`, e o nome tem de ser o deles: até ali, ele
 * vinha pronto da própria busca.
 *
 * O catálogo e a Liga concordam no nome em inglês quase sempre. Medido em
 * 2026-11-12 sobre as opções que as varreduras antigas casaram com o
 * catálogo: 2.427 de 2.675 nomes idênticos. As 248 diferenças seguem poucos
 * padrões, e são eles que este módulo aplica — todos vistos nos pares reais,
 * nenhum deduzido:
 *
 * - **Mecânica em caixa alta presa por hífen**: `Umbreon GX` → `Umbreon-GX`,
 *   `M Blastoise EX` → `M Blastoise-EX`, `Mewtwo VSTAR` → `Mewtwo-VSTAR`. É
 *   a mesma regra que a busca já usava (`nomesDeBuscaDaCarta`). O `ex`
 *   minúsculo da era Escarlate e Violeta fica com espaço (`Charizard ex`),
 *   e `BREAK`, `GL`, `G`, `FB` e `LEGEND` também: a Liga os escreve assim.
 * - **Delta Species sem o `δ`**: `Cyndaquil δ` → `Cyndaquil`.
 * - **Prism Star por extenso**: `Ditto ◇` → `Ditto Prism Star`.
 * - **Elite Four sem o `E`**: `Flareon E4` → `Flareon 4`.
 * - **Unown sem colchete**: `Unown [E]` → `Unown E`.
 * - **Nidoran por extenso**: `Nidoran♂` → `Nidoran Male`,
 *   `Giovanni's Nidoran ♀` → `Giovanni's Nidoran Female`.
 * - **Apóstrofo reto**: `Farfetch’d` → `Farfetch'd`.
 *
 * Com as regras, 2.659 dos 2.675 nomes saem iguais aos deles. O que sobra são
 * casos isolados e sem padrão (um `Lugia Break` num mar de `BREAK`, um Unown
 * de letra trocada, `Nidoran♂` que eles às vezes escrevem só `Nidoran`), e o
 * nome vai como o catálogo o grava — nunca um palpite. Se a Compra por Lista
 * não reconhecer uma linha, ela diz, e o usuário corrige na colagem.
 */

/** Mecânicas que a Liga escreve coladas ao nome por hífen. */
const MECANICA_COM_HIFEN = /\s+(EX|GX|V|VMAX|VSTAR|V-UNION)$/;

/**
 * A ordem importa num caso: o hífen da mecânica vem **antes** de tirar o
 * colchete do Unown. `Unown [V]` é a letra V, e a Liga escreve `Unown V`;
 * sem colchete primeiro, ela viraria `Unown-V`, que é outra carta (o Unown V
 * de Sword & Shield).
 */
export function nomeNaLiga(nomeCatalogo: string): string {
  return nomeCatalogo
    .replace(/[’‘]/g, "'")
    .replace(/\s*δ/g, "")
    .replace(/\s*◇/g, " Prism Star")
    .replace(/\s+E4$/, " 4")
    .replace(/\s*♂/g, " Male")
    .replace(/\s*♀/g, " Female")
    .replace(/\s+/g, " ")
    .trim()
    .replace(MECANICA_COM_HIFEN, "-$1")
    .replace(/\[([^\]]+)\]/g, "$1");
}

/**
 * Cartas que a Liga separa pelo nome e o catálogo não, por `carta_id`.
 *
 * As metades dos Estádios lendários de Delta Reign (`me06`, 094 a 099) são
 * duas cartas com o mesmo nome no catálogo, e a TCGdex não traz campo nenhum
 * que diga qual é a esquerda e qual é a direita. A Compra por Lista não casou
 * `Legendary Pyroduct (094/103)`; casou `Legendary Pyroduct (Left Half)
 * (094/103)`, corrigido à mão na colagem em 2026-11-15 — é dessa colagem que
 * vem cada linha abaixo, e nenhuma regra a deduz: um par de nomes iguais em
 * números seguidos não diz qual metade é qual. A colagem foi em minúsculas e
 * passou; aqui segue a caixa dos outros nomes.
 *
 * Uma entrada nova só com a colagem que a confirma.
 */
const NOME_NA_LIGA_POR_CARTA: Readonly<Record<string, string>> = {
  "me06-094": "Legendary Pyroduct (Left Half)",
  "me06-095": "Legendary Pyroduct (Right Half)",
  "me06-096": "Legendary Summit (Left Half)",
  "me06-097": "Legendary Summit (Right Half)",
  "me06-098": "Legendary Trench (Left Half)",
  "me06-099": "Legendary Trench (Right Half)",
};

/** O nome da Liga para a carta que a tabela acima conhece; `null` para as outras. */
export function nomeFixoNaLiga(cartaId: string): string | null {
  return NOME_NA_LIGA_POR_CARTA[cartaId] ?? null;
}
