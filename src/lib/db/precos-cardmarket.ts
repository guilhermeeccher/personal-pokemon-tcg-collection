/**
 * Persistência da fonte de preço Cardmarket (`PRECO_FONTE=cardmarket`). O
 * porquê da fonte, do valor e da conversão está em
 * `lib/dominio/preco-cardmarket.ts`; o da rodada, em
 * `lib/cardmarket/precos.ts`. As rodadas e as fotos são as mesmas tabelas da
 * Liga, marcadas com `fonte` (`precos-liga.ts`). Aqui só se lê e escreve.
 */

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import type { Database } from "./client";
import { fichasDeExibicao } from "./precos-liga";
import { precoCartaCardmarket, precoCartaCardmarketHistorico } from "./schema";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import type { Idioma } from "@/lib/dominio/enums";
import {
  converterPrecoCardmarket,
  type CriterioValorCardmarket,
  type PrecoCardmarket,
} from "@/lib/dominio/preco-cardmarket";

/**
 * Quando cada carta foi consultada pela última vez desde `desde` — para o
 * pulo por frescor. Encontrada ou não, tanto faz: aqui não há teto de
 * páginas, e "a TCGdex não traz preço do Cardmarket para esta carta" é
 * resposta (ao contrário da Liga, em que "não achei" só vale para o teto com
 * que se buscou).
 *
 * **Lê o histórico, não `preco_carta_cardmarket`.** Uma consulta que não
 * achou preço preserva a linha de um preço achado antes, inclusive o
 * `consultado_em` dela (`gravarPrecoCardmarket`); lido dali, o frescor seria
 * o do preço antigo, e a carta seria perguntada de novo a cada rodada. O
 * histórico guarda toda consulta, e a última é a resposta mais recente. O
 * filtro é só por data, que o índice `(carta_id, consultado_em)` não torna
 * seletivo; não precisa: o histórico cresce uma linha por carta consultada,
 * algumas centenas por rodada.
 */
export async function consultasCardmarketDesde(
  db: Database,
  desde: Date,
): Promise<Map<string, Date>> {
  const ultima = sql<Date>`max(${precoCartaCardmarketHistorico.consultadoEm})`;
  const linhas = await db
    .select({ cartaId: precoCartaCardmarketHistorico.cartaId, consultadoEm: ultima })
    .from(precoCartaCardmarketHistorico)
    .where(gte(precoCartaCardmarketHistorico.consultadoEm, desde))
    .groupBy(precoCartaCardmarketHistorico.cartaId);
  return new Map(linhas.map((l) => [l.cartaId, new Date(l.consultadoEm)]));
}

/** O que a consulta de uma carta respondeu. */
export interface ResultadoConsultaCardmarket {
  /** O idioma da ficha que respondeu; nulo quando nenhuma existia (404 em todos). */
  idiomaConsulta: Idioma | null;
  /** O preço lido da ficha; nulo quando não há preço do Cardmarket nela. */
  preco: PrecoCardmarket | null;
}

const dinheiro = (v: number | null) => (v === null ? null : String(v));

/**
 * Grava (upsert) o resultado de uma carta, convertido pela cotação da
 * rodada. Nunca apaga.
 *
 * Mesma regra da Liga (`gravarPrecoDeCarta`): uma consulta que **não achou**
 * não sobrescreve um preço já achado — o último preço conhecido, com a data
 * e a cotação dele, vale mais que um vazio. A linha não encontrada não
 * guarda cotação: não converteu nada.
 *
 * O valor da carta (`valor`, `valor_eur`, `criterio_valor`) é escolhido aqui,
 * na gravação, por `converterPrecoCardmarket` — a tendência, salvo a trava da
 * média de 30 dias — e vai junto para a tabela e para o histórico. Quem lê
 * (a tela, a foto, as joias) usa o valor guardado e não escolhe de novo.
 */
export async function gravarPrecoCardmarket(
  db: Database,
  cartaId: string,
  resultado: ResultadoConsultaCardmarket,
  cotacao: CotacaoPtax,
  rodadaId: string | null = null,
): Promise<void> {
  const p = resultado.preco;
  const encontrada = p !== null;
  const reais = converterPrecoCardmarket(p, cotacao.cotacao);
  const precos = {
    foil: p?.foil ?? false,
    tendenciaEur: dinheiro(p?.tendenciaEur ?? null),
    mediaEur: dinheiro(p?.mediaEur ?? null),
    minimoEur: dinheiro(p?.minimoEur ?? null),
    media30Eur: dinheiro(p?.media30Eur ?? null),
    cotacao: encontrada ? String(cotacao.cotacao) : null,
    cotacaoData: encontrada ? cotacao.data : null,
    tendencia: dinheiro(reais.tendencia),
    media: dinheiro(reais.media),
    minimo: dinheiro(reais.minimo),
    media30: dinheiro(reais.media30),
    valorEur: dinheiro(reais.valorEur),
    valor: dinheiro(reais.valor),
    criterioValor: reais.criterioValor,
    encontrada,
  };
  await db
    .insert(precoCartaCardmarket)
    .values({
      cartaId,
      idProduto: p?.idProduto ?? null,
      idiomaConsulta: resultado.idiomaConsulta,
      atualizadoUpstream: p?.atualizadoEm ?? null,
      ...precos,
      consultadoEm: sql`now()`,
    })
    .onConflictDoUpdate({
      target: precoCartaCardmarket.cartaId,
      set: {
        idProduto: sql`excluded.id_produto`,
        idiomaConsulta: sql`excluded.idioma_consulta`,
        foil: sql`excluded.foil`,
        tendenciaEur: sql`excluded.tendencia_eur`,
        mediaEur: sql`excluded.media_eur`,
        minimoEur: sql`excluded.minimo_eur`,
        cotacao: sql`excluded.cotacao`,
        cotacaoData: sql`excluded.cotacao_data`,
        tendencia: sql`excluded.tendencia`,
        media: sql`excluded.media`,
        minimo: sql`excluded.minimo`,
        media30Eur: sql`excluded.media30_eur`,
        media30: sql`excluded.media30`,
        valorEur: sql`excluded.valor_eur`,
        valor: sql`excluded.valor`,
        criterioValor: sql`excluded.criterio_valor`,
        atualizadoUpstream: sql`excluded.atualizado_upstream`,
        encontrada: sql`excluded.encontrada`,
        consultadoEm: sql`excluded.consultado_em`,
      },
      // Só sobrescreve se a nova achou, ou se a antiga também não tinha achado.
      setWhere: sql`excluded.encontrada or not ${precoCartaCardmarket.encontrada}`,
    });
  // O histórico registra a consulta como ela foi (inclusive "não achada"),
  // mesmo quando o upsert acima preservou o preço antigo: é o diário de
  // consultas, não o último estado. Só acrescenta.
  await db.insert(precoCartaCardmarketHistorico).values({ cartaId, rodadaId, ...precos });
}

export interface PrecoCardmarketListado {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  /** Em BRL, convertidos pela `cotacao` da linha. */
  minimo: number | null;
  tendencia: number | null;
  media: number | null;
  tendenciaEur: number | null;
  /** Média dos últimos 30 dias, em euro; nula nas linhas de antes da trava. */
  media30Eur: number | null;
  /** O valor guardado da carta, em BRL e em euro, e de onde ele veio. */
  valor: number | null;
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  foil: boolean;
  cotacao: number | null;
  /** YYYY-MM-DD, a data do boletim da PTAX. */
  cotacaoData: string | null;
  consultadoEm: Date;
}

const numero = (v: string | null) => (v === null ? null : Number(v));

/** Todo preço guardado, com os dados de exibição da carta (ficha pt, senão en, senão jp). */
export async function listarPrecosCardmarket(db: Database): Promise<PrecoCardmarketListado[]> {
  const precos = await db.select().from(precoCartaCardmarket);
  if (precos.length === 0) return [];

  const exibicao = await fichasDeExibicao(
    db,
    precos.map((p) => p.cartaId),
  );
  return precos.flatMap((p) => {
    const f = exibicao.get(p.cartaId);
    if (!f) return [];
    return [
      {
        cartaId: p.cartaId,
        nome: f.nome,
        setNome: f.setNome,
        localId: f.localId,
        raridade: f.raridade,
        encontrada: p.encontrada,
        minimo: numero(p.minimo),
        tendencia: numero(p.tendencia),
        media: numero(p.media),
        tendenciaEur: numero(p.tendenciaEur),
        media30Eur: numero(p.media30Eur),
        valor: numero(p.valor),
        valorEur: numero(p.valorEur),
        criterioValor: p.criterioValor,
        foil: p.foil,
        cotacao: numero(p.cotacao),
        cotacaoData: p.cotacaoData,
        consultadoEm: new Date(p.consultadoEm),
      },
    ];
  });
}

/**
 * O valor guardado (`valor`) de cada carta com preço, em reais — a base da
 * ordem das joias quando a fonte ativa é o Cardmarket. É a coluna que a
 * gravação preencheu (`converterPrecoCardmarket`), com a trava da média de
 * 30 dias já aplicada: as joias e a tela de preços ordenam pelo mesmo número.
 */
export async function valoresPorCartaCardmarket(
  db: Database,
  cartaIds: readonly string[],
): Promise<Map<string, number>> {
  if (cartaIds.length === 0) return new Map();
  const linhas = await db
    .select({ cartaId: precoCartaCardmarket.cartaId, valor: precoCartaCardmarket.valor })
    .from(precoCartaCardmarket)
    .where(
      and(
        eq(precoCartaCardmarket.encontrada, true),
        isNotNull(precoCartaCardmarket.valor),
        inArray(precoCartaCardmarket.cartaId, [...cartaIds]),
      ),
    );
  return new Map(linhas.flatMap((l) => (l.valor === null ? [] : [[l.cartaId, Number(l.valor)] as const])));
}
