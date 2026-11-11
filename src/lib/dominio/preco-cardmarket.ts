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
 * Com uma trava: tendência acima de `LIMITE_TENDENCIA_SOBRE_MEDIA30` vezes a
 * média de 30 dias da própria carta não é o valor dela — vale a média de 30
 * dias (`escolherValorCardmarket`). O valor é escolhido aqui, uma vez, na
 * gravação, e **guardado** na linha (`valor`, `valor_eur`, `criterio_valor`):
 * a ordem da tela, o resumo, a foto do gráfico e as joias da Visão geral leem
 * o valor guardado, e nenhum deles refaz a escolha por conta própria.
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
  /**
   * Média dos últimos 30 dias (`avg30`, ou `avg30-holo` no conjunto foil): o
   * freio da tendência fora da curva (`escolherValorCardmarket`).
   */
  media30Eur: number | null;
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
 * o mínimo sozinho não basta para dizer quanto a carta vale. A média de 30
 * dias vem do mesmo conjunto (`avg30` ou `avg30-holo`): frear a tendência de
 * uma versão com a média da outra seria comparar preços de cartas diferentes.
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
  let media30 = precoUtil(cm.avg30);
  let foil = false;
  if (tendencia === null && media === null) {
    tendencia = precoUtil(cm["trend-holo"]);
    media = precoUtil(cm["avg-holo"]);
    minimo = precoUtil(cm["low-holo"]);
    media30 = precoUtil(cm["avg30-holo"]);
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
    media30Eur: media30,
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

/**
 * Acima de quantas vezes a média de 30 dias a tendência deixa de ser o valor
 * da carta.
 *
 * O caso que criou a trava, da primeira rodada real (2026-11-11): uma carta
 * barata veio com a tendência 10,6× a média da própria carta e, só por isso,
 * subiu às primeiras posições das joias da Visão geral. Foi a única daquela
 * rodada com tendência acima de 2× a média. Três vezes deixa folga para uma
 * carta que valorizou de verdade no mês e pega o salto que só uma venda
 * isolada explica.
 *
 * Errar para a média de 30 dias é o lado seguro: uma carta que disparou de
 * fato aparece abaixo do que vale até a média alcançá-la, e a tela diz por
 * quê; uma venda isolada levada a sério reordenaria as joias e inflaria o
 * total do gráfico com um número que ninguém pagaria.
 */
export const LIMITE_TENDENCIA_SOBRE_MEDIA30 = 3;

/** De onde saiu o valor da carta: a tendência, a média de 30 dias (a trava) ou a média. */
export type CriterioValorCardmarket = "tendencia" | "media30" | "media";

/** O valor da carta, em euro, e o critério que o escolheu. */
export interface ValorCardmarket {
  valorEur: number;
  criterio: CriterioValorCardmarket;
}

/**
 * Em centavos, a precisão que se guarda (`numeric(10,2)`). A comparação com
 * o limite é feita assim, em inteiros: em ponto flutuante, `3 × 2,15` dá
 * `6,449999…`, e uma tendência de exatamente 6,45 — 3× na conta de quem
 * confere — cairia na trava por erro de arredondamento.
 */
const centavos = (v: number) => Math.round(v * 100);

/**
 * O valor da carta nesta fonte, escolhido uma vez e guardado na linha:
 *
 * - tendência presente, sem média de 30 dias ou até
 *   `LIMITE_TENDENCIA_SOBRE_MEDIA30` × a média de 30 dias (inclusive) → a
 *   tendência (`"tendencia"`);
 * - tendência acima desse limite → a média de 30 dias (`"media30"`);
 * - sem tendência, com média → a média (`"media"`);
 * - sem tendência e sem média → `null`. A média de 30 dias sozinha não
 *   entra: ela é o freio da tendência, não um substituto dela (e
 *   `extrairPrecoCardmarket` já devolve `null` nesse caso).
 *
 * Valor que não é preço utilizável (zero, negativo, não finito) vale como
 * ausente, pela mesma regra de `extrairPrecoCardmarket`: uma média de 30 dias
 * zerada não pode virar "a carta vale nada".
 */
export function escolherValorCardmarket(p: {
  tendenciaEur: number | null;
  mediaEur: number | null;
  media30Eur: number | null;
}): ValorCardmarket | null {
  const tendencia = precoUtil(p.tendenciaEur);
  const media = precoUtil(p.mediaEur);
  const media30 = precoUtil(p.media30Eur);
  if (tendencia !== null) {
    if (media30 !== null && centavos(tendencia) > LIMITE_TENDENCIA_SOBRE_MEDIA30 * centavos(media30)) {
      return { valorEur: media30, criterio: "media30" };
    }
    return { valorEur: tendencia, criterio: "tendencia" };
  }
  if (media !== null) return { valorEur: media, criterio: "media" };
  return null;
}

/** O que se grava de uma consulta, em reais, com o valor da carta já escolhido. */
export interface PrecoCardmarketEmReais {
  tendencia: number | null;
  media: number | null;
  minimo: number | null;
  media30: number | null;
  /** O valor da carta (`escolherValorCardmarket`), em euro e em reais. */
  valorEur: number | null;
  valor: number | null;
  criterioValor: CriterioValorCardmarket | null;
}

/**
 * Converte a consulta inteira pela cotação da rodada e escolhe o valor da
 * carta. O valor em reais é a conversão do valor em euro, e não uma escolha
 * refeita sobre os valores já convertidos: assim ele é sempre igual, centavo
 * a centavo, à coluna de onde veio (`tendencia`, `media30` ou `media`).
 * Consulta sem preço (`null`) devolve tudo nulo.
 */
export function converterPrecoCardmarket(
  p: PrecoCardmarket | null,
  cotacao: number,
): PrecoCardmarketEmReais {
  const escolha = p === null ? null : escolherValorCardmarket(p);
  return {
    tendencia: converterParaReais(p?.tendenciaEur ?? null, cotacao),
    media: converterParaReais(p?.mediaEur ?? null, cotacao),
    minimo: converterParaReais(p?.minimoEur ?? null, cotacao),
    media30: converterParaReais(p?.media30Eur ?? null, cotacao),
    valorEur: escolha?.valorEur ?? null,
    valor: converterParaReais(escolha?.valorEur ?? null, cotacao),
    criterioValor: escolha?.criterio ?? null,
  };
}

/** Uma linha de `preco_carta_cardmarket` já em reais, no que o agregador precisa. */
export interface LinhaPrecoCardmarket {
  encontrada: boolean;
  minimo: number | null;
  media: number | null;
  /** O valor guardado da carta (coluna `valor`), em reais. */
  valor: number | null;
}

/**
 * A linha do Cardmarket no formato da Liga (`PrecoDeCarta`), para usar o
 * mesmo `resumirPrecos`, `fotografarPrecos` e `compararPorValorDesc` em vez
 * de duplicar a soma e a ordem.
 *
 * **Atenção aos nomes:** nesta fonte, o "médio" do agregador
 * (`precoMedio`, que é o que soma, ordena e vira `somaMedios` na foto) é o
 * **valor guardado** da carta — a tendência, salvo a trava da média de 30
 * dias ou a falta de tendência (`escolherValorCardmarket`) —, e o "mínimo"
 * (`preco`, que vira `somaMinimos`) é o `low` do Cardmarket. O nome das
 * colunas da foto ficou da Liga; o significado, numa foto de fonte
 * `cardmarket`, é este. O valor chega pronto, lido da coluna `valor`:
 * escolhê-lo de novo aqui deixaria a foto e a tela discordarem.
 */
export function comoPrecoDeCarta(linha: LinhaPrecoCardmarket): PrecoDeCarta {
  return {
    encontrada: linha.encontrada,
    preco: linha.minimo,
    precoMedio: linha.valor,
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
