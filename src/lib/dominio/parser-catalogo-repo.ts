/**
 * Conversão do formato bruto do repositório `tcgdex/cards-database`
 * (clone local, ver `scripts/importar-catalogo-repo.ts`) para os mesmos
 * tipos que `lib/sync/tcgdex.ts` expõe para a API (`SetDetalhado`,
 * `CardDetalhado`). Uma vez convertido, o importador chama a mesma
 * `paraLinha` que o sync usa (`lib/sync/catalogo.ts`) — garante que a
 * linha gravada em `carta_catalogo` tem exatamente o mesmo formato,
 * venha ela da API ou do clone.
 *
 * Módulo puro, sem I/O (não lê arquivo, não importa módulo `.ts` do
 * repositório — isso é responsabilidade do script chamador). Toda a
 * lógica aqui replica, de propósito, o código real do compilador da
 * TCGdex (`server/compiler/utils/{cardUtil,setUtil}.ts` no repositório
 * clonado) — não é uma reinterpretação nossa de como resolver texto
 * multilíngue, releaseDate ou variantes, é a mesma conta que a API faz.
 * Onde o comportamento do upstream é estranho (ver `calcularVariantesRepo`
 * sobre o stamp de 1ª edição), replicamos o estranho — não corrigimos por
 * conta própria, para não divergir do que a API realmente devolveria.
 */

import type { CardDetalhado, SetDetalhado, VariantesCarta } from "@/lib/sync/tcgdex";

/** Texto multilíngue como aparece nos arquivos do repositório (`Languages<T>`). */
export type TextoMultilingue = Record<string, string | undefined>;

/**
 * Uma entrada do array `variants` (formato "detailed" do repositório).
 * `subtype` existe no dado real (ex.: `"unlimited"`, `"shadowless"`) mas
 * não é usado por nenhuma das cinco flags que gravamos — passthrough só
 * por fidelidade de tipo com os arquivos reais.
 */
export interface RepoVarianteDetalhada {
  type?: string;
  stamp?: string[];
  subtype?: string;
}

/**
 * `Card.variants` no repositório: ou um array de variantes detalhadas, ou
 * o objeto legado de flags — nunca os dois. Ausente é o caso mais comum
 * hoje mesmo dentro de `data-asia` (cerca de 30% dos arquivos de carta).
 */
export type RepoVariantesCarta =
  | RepoVarianteDetalhada[]
  | {
      normal?: boolean;
      reverse?: boolean;
      holo?: boolean;
      firstEdition?: boolean;
      wPromo?: boolean;
    }
  | undefined;

export interface RepoCartaBruta {
  name: TextoMultilingue;
  illustrator?: string;
  category: string;
  rarity?: string;
  dexId?: number[];
  variants?: RepoVariantesCarta;
}

export interface RepoSerieBruta {
  id: string;
  name: TextoMultilingue;
}

export interface RepoSetBruto {
  id: string;
  name: TextoMultilingue;
  serie: RepoSerieBruta;
  cardCount: { official: number };
  releaseDate: string | TextoMultilingue;
  /**
   * Nome no plural mesmo (`abbreviations`, não `abbreviation`) — é assim
   * que o dado bruto do repositório guarda o campo; a API expõe
   * `abbreviation` (singular) só na resposta já processada. Não visto
   * preenchido em nenhum arquivo de `data-asia` na auditoria de
   * 2026-08-26 — `setSigla` fica `null` para todo set japonês até algum
   * arquivo do repositório vir a preencher isso.
   */
  abbreviations?: { official?: string } & TextoMultilingue;
}

/**
 * Resolve texto multilíngue num idioma, replicando `resolveText` do
 * compilador da TCGdex: usa a chave direta; se faltar e o idioma não tiver
 * hífen, cai para a primeira chave que comece com o mesmo prefixo (não faz
 * diferença prática para `ja`, que não tem variante regional no conjunto de
 * idiomas suportado — implementado mesmo assim por fidelidade ao original).
 */
export function textoNoIdioma(
  texto: TextoMultilingue | undefined,
  idioma: string,
): string | undefined {
  if (!texto) return undefined;
  const direto = texto[idioma];
  if (direto !== undefined) return direto;
  if (!idioma.includes("-")) {
    const chave = Object.keys(texto).find((k) => k.startsWith(idioma));
    if (chave) return texto[chave];
  }
  return undefined;
}

/**
 * `releaseDate` pode ser uma string ISO direta ou um objeto multilíngue
 * (visto em ~1/3 dos sets japoneses de `data-asia`). Replica a resolução
 * do compilador: idioma pedido, senão a primeira chave do objeto na ordem
 * em que foi declarada no arquivo de origem.
 */
export function dataLancamentoNoIdioma(
  releaseDate: string | TextoMultilingue,
  idioma: string,
): string {
  if (typeof releaseDate === "string") return releaseDate;
  const direto = releaseDate[idioma];
  if (direto) return direto;
  const primeiraChave = Object.keys(releaseDate)[0];
  return primeiraChave !== undefined ? (releaseDate[primeiraChave] ?? "") : "";
}

/**
 * Um set só existe para um idioma se TANTO o nome do set QUANTO o nome da
 * série tiverem tradução nesse idioma — replica `isSetAvailable` do
 * compilador. Achado real em `data-asia`: várias séries antigas (BW, DP,
 * DPt) gravam a série como `{ id: 'null', name: {} }` — sem nome em
 * nenhum idioma —, então nenhum set delas jamais qualifica, mesmo quando
 * o set individual tem nome em `ja`.
 */
export function setDisponivelNoIdioma(
  set: Pick<RepoSetBruto, "name" | "serie">,
  idioma: string,
): boolean {
  return (
    Boolean(textoNoIdioma(set.name, idioma)) &&
    Boolean(textoNoIdioma(set.serie.name, idioma))
  );
}

/** Uma carta só existe para um idioma se tiver nome traduzido nesse idioma. */
export function cartaDisponivelNoIdioma(
  carta: Pick<RepoCartaBruta, "name">,
  idioma: string,
): boolean {
  return Boolean(textoNoIdioma(carta.name, idioma));
}

/**
 * Deriva as cinco flags de variante (`VariantesCarta`, o mesmo tipo que
 * `lib/sync/tcgdex.ts` espera de uma carta vinda da API) a partir do dado
 * bruto do repositório. Replica exatamente
 * `variantsDetailedToVariants`/o fallback de `cardToCardSingle` no
 * compilador da TCGdex (`server/compiler/utils/cardUtil.ts`):
 *
 * - Array de variantes detalhadas (o único formato visto em `data-asia` —
 *   nenhum arquivo usa o objeto de flags legado): `normal`/`reverse`/`holo`
 *   viram true se alguma entrada tiver aquele `type`; `firstEdition` só
 *   fica true com o stamp EXATO `'1st-edition'` (hífen); `wPromo` só com
 *   `'w-Promo'` exato.
 * - **Achado importante, não corrigido de propósito:** o repositório tem
 *   1.166 stamps gravados como `'1st edition'` (espaço) e 85 como
 *   `'1st Edition'` (maiúscula) — nenhum dos dois bate a comparação exata
 *   da API, então essas variantes saem com `firstEdition: false` mesmo
 *   sendo fisicamente 1ª edição. É uma inconsistência do dado upstream,
 *   não nossa: replicamos o comportamento real da API (a mesma
 *   comparação de string), não inventamos uma normalização mais
 *   permissiva que produziria um resultado diferente do que a API viva
 *   devolveria se estivesse acessível.
 * - Campo `variants` ausente (~30% dos arquivos de carta em `data-asia`):
 *   a API assume `normal: true` por padrão e as outras quatro `false` —
 *   não "nenhuma variante marcada" (isso é tratado depois, na leitura, por
 *   `variantes-catalogo.ts`).
 */
export function calcularVariantesRepo(
  variants: RepoVariantesCarta,
): VariantesCarta {
  if (Array.isArray(variants)) {
    return {
      normal: variants.some((v) => v.type === "normal"),
      reverse: variants.some((v) => v.type === "reverse"),
      holo: variants.some((v) => v.type === "holo"),
      firstEdition: variants.some(
        (v) => v.stamp?.some((s) => s === "1st-edition") ?? false,
      ),
      wPromo: variants.some(
        (v) => v.stamp?.some((s) => s === "w-Promo") ?? false,
      ),
    };
  }
  return {
    normal: typeof variants?.normal === "boolean" ? variants.normal : true,
    reverse: typeof variants?.reverse === "boolean" ? variants.reverse : false,
    holo: typeof variants?.holo === "boolean" ? variants.holo : false,
    firstEdition:
      typeof variants?.firstEdition === "boolean"
        ? variants.firstEdition
        : false,
    wPromo: typeof variants?.wPromo === "boolean" ? variants.wPromo : false,
  };
}

/**
 * Converte o `Set` bruto do repositório para `SetDetalhado` (o tipo que
 * `paraLinha` espera), já resolvido num idioma. `qtdCartasNoIdioma` é a
 * contagem de arquivos de carta daquele set que têm nome traduzido nesse
 * idioma — replica `cardCount.total = Math.max(official, cards.length)`
 * do compilador (`setUtil.ts`); quem enumera os arquivos é o script
 * chamador, não este módulo.
 */
export function converterSetRepoParaDetalhado(
  set: RepoSetBruto,
  idioma: string,
  qtdCartasNoIdioma: number,
): SetDetalhado {
  return {
    id: set.id,
    name: textoNoIdioma(set.name, idioma) ?? "",
    serie: {
      id: set.serie.id,
      name: textoNoIdioma(set.serie.name, idioma) ?? "",
    },
    cardCount: {
      official: set.cardCount.official,
      total: Math.max(set.cardCount.official, qtdCartasNoIdioma),
    },
    cards: [],
    abbreviation: set.abbreviations?.official
      ? { official: set.abbreviations.official }
      : undefined,
    releaseDate: dataLancamentoNoIdioma(set.releaseDate, idioma),
  };
}

/**
 * Filtra `dexId` para só números inteiros. Achado real em `data-asia`:
 * 4 cartas de Rayquaza δ ("Delta Species", era EX/Holon) gravam
 * `dexId: [384.1]` — convenção própria do repositório para marcar uma
 * variante fora do padrão, não um número real da Pokédex Nacional (que é
 * sempre inteiro; a coluna `dex_ids` do banco é `integer[]` e rejeita o
 * valor fracionário). Não arredondamos para 384: isso seria decidir, por
 * conta própria, que a carta representa o Rayquaza "normal" — mais perto
 * de chutar do que de ler o dado. Em vez disso, descartamos o valor
 * fracionário (a carta fica sem `dexId`, como Treinador/Energia), pelo
 * mesmo princípio de "não casou, não inventa" que `derivarForma` já
 * segue: a carta continua no catálogo normalmente, só não fica elegível
 * para vaga de Pokédex.
 */
export function dexIdsValidos(
  dexId: number[] | undefined,
): number[] | undefined {
  if (!dexId) return dexId;
  return dexId.filter((n) => Number.isInteger(n));
}

/**
 * Converte a `Card` bruta do repositório para `CardDetalhado`, já
 * resolvida num idioma. `id` é `${setId}-${localId}` — o repositório não
 * grava o id composto (só o `localId`, que é o nome do arquivo sem
 * extensão); quem descobre o `localId` é o script chamador, a partir do
 * nome do arquivo, preservando zeros à esquerda.
 *
 * `image` nunca é preenchido: o repositório não traz esse campo (contrato
 * da tarefa — outra frente cuida do fallback de imagem).
 */
export function converterCartaRepoParaDetalhada(
  setId: string,
  localId: string,
  carta: RepoCartaBruta,
  idioma: string,
): CardDetalhado {
  return {
    id: `${setId}-${localId}`,
    localId,
    name: textoNoIdioma(carta.name, idioma) ?? "",
    category: carta.category,
    rarity: carta.rarity,
    illustrator: carta.illustrator,
    dexId: dexIdsValidos(carta.dexId),
    variants: calcularVariantesRepo(carta.variants),
  };
}
