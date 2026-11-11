/**
 * Preço de referência pelo Cardmarket — o que se lê do campo `pricing` da
 * ficha da TCGdex, como vira reais e como entra no mesmo agregador da Liga.
 * Módulo puro: não faz requisição, não toca banco. A orquestração está em
 * `lib/cardmarket/precos.ts`; o porquê da fonte, em `fonte-preco.ts`.
 *
 * ## Qual número é "o valor da carta"
 *
 * A **tendência** (`trend`) do Cardmarket, convertida pela PTAX. Na medição
 * de 2026-11-11, numa instalação real, a tendência convertida ficou perto do
 * **menor** preço da LigaPokemon (no total e, nas cartas caras, carta a
 * carta) e bem abaixo do preço **médio** da Liga, que é puxado por anúncios
 * caros. Por isso a tela a apresenta como comparável ao mínimo da Liga, e a
 * série do gráfico é separada da da Liga: trocar uma pela outra no mesmo
 * gráfico pareceria uma queda que não aconteceu. Sem tendência, vale a média
 * (`avg`). O TCGplayer, que a mesma ficha também traz, ficou mais longe na
 * medição e não entra.
 *
 * ## A exceção à regra "sem conversão de moeda"
 *
 * Esta é a única fonte do sistema que converte. O valor em euro é
 * convertido pela PTAX de fechamento do dia (`cotacao-ptax.ts`), e a
 * cotação e a data ficam gravadas em cada linha, para a tela dizer de onde
 * veio o número. Nunca é somado, misturado na mesma série ou comparado com
 * valores da Liga, e nunca é apresentado como preço de mercado brasileiro.
 */

import type { Idioma } from "./enums";
import type { PrecoDeCarta } from "./precos-cartas-especiais";

/** O que a ficha da TCGdex diz do Cardmarket, em euro. */
export interface PrecoCardmarket {
  /** `idProduct` do Cardmarket — o produto que a ficha aponta. */
  idProduto: number | null;
  tendenciaEur: number | null;
  mediaEur: number | null;
  minimoEur: number | null;
  /** Os valores vieram dos campos `-holo` (não havia os sem foil). */
  foil: boolean;
  /** `pricing.cardmarket.updated`: quando a TCGdex atualizou o preço. */
  atualizadoEm: Date | null;
}

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valor de preço utilizável. Zero, negativo, não finito, `null` e ausente
 * valem como ausente: a upstream escreve `"trend-holo": 0` quando não tem
 * dado, e um zero levado a sério viraria "a carta vale nada".
 */
function precoUtil(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Lê o preço do Cardmarket de `pricing` (o campo inteiro da ficha, com
 * `cardmarket` e `tcgplayer` dentro). Formato conferido ao vivo em
 * 2026-11-11: `{ cardmarket: { updated, unit: "EUR", idProduct, avg, low,
 * trend, avg1, avg7, avg30, "avg-holo", "low-holo", "trend-holo", ... } }`.
 *
 * Usa os campos sem foil; só quando a tendência e a média sem foil faltam
 * as duas é que cai nos `-holo` (carta que só existe em foil) e marca
 * `foil`. Sem tendência e sem média no conjunto escolhido, devolve `null` —
 * o mínimo sozinho não basta para dizer quanto a carta vale.
 *
 * Unidade diferente de euro também devolve `null`: a conversão é pela PTAX
 * do euro, e converter outra moeda com ela daria um número errado com cara
 * de certo.
 */
export function extrairPrecoCardmarket(pricing: unknown): PrecoCardmarket | null {
  if (!ehObjeto(pricing)) return null;
  const cm = pricing.cardmarket;
  if (!ehObjeto(cm)) return null;
  if (cm.unit !== undefined && cm.unit !== null && cm.unit !== "EUR") return null;

  let tendencia = precoUtil(cm.trend);
  let media = precoUtil(cm.avg);
  let minimo = precoUtil(cm.low);
  let foil = false;
  if (tendencia === null && media === null) {
    tendencia = precoUtil(cm["trend-holo"]);
    media = precoUtil(cm["avg-holo"]);
    minimo = precoUtil(cm["low-holo"]);
    foil = true;
  }
  if (tendencia === null && media === null) return null;

  const idProduto =
    typeof cm.idProduct === "number" && Number.isSafeInteger(cm.idProduct) && cm.idProduct > 0
      ? cm.idProduct
      : null;
  const atualizado = typeof cm.updated === "string" ? new Date(cm.updated) : null;

  return {
    idProduto,
    tendenciaEur: tendencia,
    mediaEur: media,
    minimoEur: minimo,
    foil,
    atualizadoEm: atualizado !== null && Number.isFinite(atualizado.getTime()) ? atualizado : null,
  };
}

/** Euro → real pela cotação dada, arredondado a centavos. */
export function converterParaReais(eur: number | null, cotacao: number): number | null {
  // Cotação inválida é erro de programa (a rodada só começa com uma PTAX
  // válida): estourar aqui é melhor que gravar preço errado em silêncio.
  if (!Number.isFinite(cotacao) || cotacao <= 0) {
    throw new Error(`Cotação inválida para conversão: ${cotacao}`);
  }
  if (eur === null) return null;
  return Math.round(eur * cotacao * 100) / 100;
}

/** O valor da carta nesta fonte: a tendência; sem ela, a média. */
export function valorCardmarket(p: { tendencia: number | null; media: number | null }): number | null {
  return p.tendencia ?? p.media;
}

/** Uma linha de `preco_carta_cardmarket` já em reais, no que o agregador precisa. */
export interface LinhaPrecoCardmarket {
  encontrada: boolean;
  minimo: number | null;
  tendencia: number | null;
  media: number | null;
}

/**
 * A linha do Cardmarket no formato da Liga (`PrecoDeCarta`), para usar o
 * mesmo `resumirPrecos`, `fotografarPrecos` e `compararPorValorDesc` em vez
 * de duplicar a soma e a ordem.
 *
 * **Atenção aos nomes:** nesta fonte, o "médio" do agregador
 * (`precoMedio`, que é o que soma, ordena e vira `somaMedios` na foto) é a
 * **tendência** — senão a média —, e o "mínimo" (`preco`, que vira
 * `somaMinimos`) é o `low` do Cardmarket. O nome das colunas da foto ficou
 * da Liga; o significado, numa foto de fonte `cardmarket`, é este.
 */
export function comoPrecoDeCarta(linha: LinhaPrecoCardmarket): PrecoDeCarta {
  return {
    encontrada: linha.encontrada,
    preco: linha.minimo,
    precoMedio: valorCardmarket(linha),
    precoMaximo: linha.media,
  };
}

const ORDEM_CONSULTA: readonly Idioma[] = ["en", "pt", "jp"];

/**
 * Em que ordem perguntar à TCGdex pela ficha da carta: en, pt, jp — só os
 * idiomas que a carta tem no catálogo.
 *
 * O inglês primeiro porque é o catálogo mais completo da upstream e o que
 * quase toda carta ocidental tem; a ficha pt da mesma carta traz o mesmo
 * produto do Cardmarket com os mesmos valores (medido em 2026-11-11: o preço
 * é da carta, não do idioma), então ela só serve quando a en não existe. O
 * japonês por último: os sets japoneses são catálogo à parte (`set_id`
 * próprio), e a ficha jp só responde pela carta que só existe em jp.
 *
 * A tradução `jp` → `ja` da URL continua em `codigoIdiomaUpstream`.
 */
export function idiomasDeConsulta(idiomas: readonly Idioma[]): Idioma[] {
  return ORDEM_CONSULTA.filter((i) => idiomas.includes(i));
}

/** O que a tela mostra como "Cotação usada". */
export interface CotacaoUsada {
  valor: number;
  /** YYYY-MM-DD, a data do boletim da PTAX. */
  data: string;
}

/**
 * A cotação da linha **encontrada** consultada mais recentemente — a que a
 * tela mostra ao lado do botão. Linha não encontrada não converteu nada e
 * não guarda cotação; sem nenhuma encontrada, `null`.
 */
export function cotacaoMaisRecente(
  linhas: ReadonlyArray<{
    encontrada: boolean;
    cotacao: number | null;
    cotacaoData: string | null;
    consultadoEm: Date;
  }>,
): CotacaoUsada | null {
  let maisNova: { valor: number; data: string; em: Date } | null = null;
  for (const l of linhas) {
    if (!l.encontrada || l.cotacao === null || l.cotacaoData === null) continue;
    if (maisNova === null || l.consultadoEm > maisNova.em) {
      maisNova = { valor: l.cotacao, data: l.cotacaoData, em: l.consultadoEm };
    }
  }
  return maisNova === null ? null : { valor: maisNova.valor, data: maisNova.data };
}
