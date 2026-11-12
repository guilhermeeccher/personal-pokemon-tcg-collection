/**
 * Persistência das opções de compra tiradas do catálogo
 * (`PRECO_FONTE=cardmarket`): as candidatas de cada vaga vazia, o preço de
 * referência delas e as rodadas que buscam esse preço. O porquê está em
 * `lib/dominio/candidatas-compra.ts`; a rodada, em
 * `lib/cardmarket/candidatas.ts`. Aqui só se lê e escreve.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import { imagemDaCarta, origemDaImagem } from "./consultas";
import { listarVagasVaziasPokedex, listarVagasVaziasSet } from "./liga";
import type { ResultadoConsultaCardmarket } from "./precos-cardmarket";
import { cartaCatalogo, precoCandidataCardmarket, rodadaPrecoCandidata } from "./schema";
import {
  montarCandidata,
  type CartaCandidata,
  type FichaCandidata,
} from "@/lib/dominio/candidatas-compra";
import type { CotacaoPtax } from "@/lib/dominio/cotacao-ptax";
import type { Idioma } from "@/lib/dominio/enums";
import { ordemIdiomasPorCarta } from "@/lib/dominio/idioma-catalogo";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import {
  converterPrecoCardmarket,
  type CriterioValorCardmarket,
} from "@/lib/dominio/preco-cardmarket";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";

/** Uma vaga vazia e as cartas do catálogo que a preencheriam. */
export interface VagaComCandidatas {
  chave: string;
  /** Número da Pokédex; nulo em coleção de set. */
  dex: number | null;
  /** A espécie (Pokédex) ou o nome da carta (set). */
  rotulo: string;
  /** Espécie da vaga de Pokédex, que a escolha grava. Nula no set. */
  especie: string | null;
  /** Nome do set, em coleção de set. */
  setNome: string | null;
  candidatas: CartaCandidata[];
}

/** As colunas de `carta_catalogo` que viram `FichaCandidata`, sem a foto. */
const colunasSemImagem = {
  cartaId: cartaCatalogo.id,
  idioma: cartaCatalogo.idioma,
  nome: cartaCatalogo.nome,
  setId: cartaCatalogo.setId,
  setNome: cartaCatalogo.setNome,
  setSigla: cartaCatalogo.setSigla,
  setQtdOficial: cartaCatalogo.setQtdOficial,
  setLancamento: cartaCatalogo.setLancamento,
  localId: cartaCatalogo.localId,
  raridade: cartaCatalogo.raridade,
  dexIds: cartaCatalogo.dexIds,
};

/**
 * Com a foto, para a tela. A cadeia da foto é uma subconsulta por linha
 * (`imagemDaCarta`), e uma Pokédex tem milhares de fichas candidatas: quem
 * não mostra nada — a marcação, a busca de preços — pede sem ela.
 */
function colunasDaFicha(comImagem: boolean) {
  return comImagem
    ? {
        ...colunasSemImagem,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      }
    : { ...colunasSemImagem, imagemUrl: sql<string | null>`null`, imagemOrigem: sql<string | null>`null` };
}

type LinhaFicha = {
  cartaId: string;
  idioma: Idioma;
  nome: string;
  setId: string;
  setNome: string;
  setSigla: string | null;
  setQtdOficial: number | null;
  setLancamento: string | null;
  localId: string;
  raridade: string | null;
  dexIds: number[];
  imagemUrl: string | null;
  imagemOrigem: string | null;
};

function comoFicha(l: LinhaFicha): FichaCandidata {
  return { ...l, imagemOrigem: (l.imagemOrigem as OrigemImagem | null) ?? null };
}

/** Agrupa as fichas por carta física, preservando a ordem em que chegaram. */
function porCarta(linhas: readonly LinhaFicha[]): Map<string, LinhaFicha[]> {
  const mapa = new Map<string, LinhaFicha[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.cartaId);
    if (lista) lista.push(l);
    else mapa.set(l.cartaId, [l]);
  }
  return mapa;
}

/**
 * Pokédex: as cartas pt/en ativas com exatamente um `dexId` (regra 2) de cada
 * vaga vazia. Uma consulta só para a coleção inteira; o lançamento mais novo
 * vem primeiro, que é o desempate da tela.
 */
async function candidatasDaPokedex(
  db: Database,
  colecaoId: string,
  comImagem: boolean,
): Promise<VagaComCandidatas[]> {
  const vagas = await listarVagasVaziasPokedex(db, colecaoId);
  if (vagas.length === 0) return [];

  // Números inteiros, vindos da chave da vaga: seguros no `sql.raw`, como em
  // `consultas.ts`.
  const dexes = [...new Set(vagas.map((v) => v.dex))];
  const linhas = (await db
    .select(colunasDaFicha(comImagem))
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        inArray(cartaCatalogo.idioma, ["pt", "en"]),
        sql`array_length(${cartaCatalogo.dexIds}, 1) = 1`,
        sql`${cartaCatalogo.dexIds} && ${sql.raw(`ARRAY[${dexes.join(",")}]::integer[]`)}`,
      ),
    )
    .orderBy(desc(cartaCatalogo.setLancamento), cartaCatalogo.id)) as LinhaFicha[];

  const porDex = new Map<number, LinhaFicha[]>();
  for (const l of linhas) {
    const dex = l.dexIds[0];
    const lista = porDex.get(dex);
    if (lista) lista.push(l);
    else porDex.set(dex, [l]);
  }

  return vagas.map((v) => ({
    chave: v.chave,
    dex: v.dex,
    rotulo: v.especie,
    especie: v.especie,
    setNome: null,
    candidatas: [...porCarta(porDex.get(v.dex) ?? []).values()].flatMap((fichas) => {
      const c = montarCandidata(fichas.map(comoFicha), ["pt", "en"]);
      return c ? [c] : [];
    }),
  }));
}

/**
 * Set: a carta de cada vaga vazia, resolvida como a varredura resolvia
 * (`listarVagasVaziasSet`, carta a carta na ordem de idioma da coleção), com
 * as fichas dela em todos os idiomas — a ficha em inglês dá o nome da linha.
 */
async function candidatasDoSet(
  db: Database,
  colecaoId: string,
  parametro: ParametroSet,
  comImagem: boolean,
): Promise<VagaComCandidatas[]> {
  const vagas = await listarVagasVaziasSet(db, colecaoId);
  if (vagas.length === 0) return [];

  const linhas = (await db
    .select(colunasDaFicha(comImagem))
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        inArray(cartaCatalogo.id, [...new Set(vagas.map((v) => v.cartaId))]),
      ),
    )) as LinhaFicha[];
  const fichasPorCarta = porCarta(linhas);
  const ordem = ordemIdiomasPorCarta(parametro.idiomaCatalogo);

  return vagas.map((v) => {
    const c = montarCandidata((fichasPorCarta.get(v.cartaId) ?? []).map(comoFicha), ordem);
    return {
      chave: v.chave,
      dex: null,
      rotulo: v.nome,
      especie: null,
      setNome: v.setNome,
      candidatas: c ? [c] : [],
    };
  });
}

/** As vagas vazias de uma coleção Pokédex ou de set, com as candidatas de cada uma. */
export async function listarCandidatasDaColecao(
  db: Database,
  colecao: { id: string; tipo: string; parametro: unknown },
  { comImagem = false }: { comImagem?: boolean } = {},
): Promise<VagaComCandidatas[]> {
  if (colecao.tipo === "pokedex") return candidatasDaPokedex(db, colecao.id, comImagem);
  if (colecao.tipo === "set") {
    return candidatasDoSet(db, colecao.id, colecao.parametro as ParametroSet, comImagem);
  }
  return [];
}

// --- Preço das candidatas -----------------------------------------------------

export interface PrecoCandidata {
  encontrada: boolean;
  /** O valor da carta em reais (`converterPrecoCardmarket`); nulo sem preço. */
  valor: number | null;
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  tendenciaEur: number | null;
  media30Eur: number | null;
  foil: boolean;
  cotacao: number | null;
  /** YYYY-MM-DD, a data do boletim da PTAX. */
  cotacaoData: string | null;
  /** Quando o preço guardado foi lido. */
  precoEm: Date | null;
  /** A última pergunta, achada ou não. */
  consultadoEm: Date;
}

const numero = (v: string | null) => (v === null ? null : Number(v));

export async function precosDasCandidatas(
  db: Database,
  cartaIds: readonly string[],
): Promise<Map<string, PrecoCandidata>> {
  if (cartaIds.length === 0) return new Map();
  const linhas = await db
    .select()
    .from(precoCandidataCardmarket)
    .where(inArray(precoCandidataCardmarket.cartaId, [...new Set(cartaIds)]));
  return new Map(
    linhas.map((l) => [
      l.cartaId,
      {
        encontrada: l.encontrada,
        valor: numero(l.valor),
        valorEur: numero(l.valorEur),
        criterioValor: l.criterioValor,
        tendenciaEur: numero(l.tendenciaEur),
        media30Eur: numero(l.media30Eur),
        foil: l.foil,
        cotacao: numero(l.cotacao),
        cotacaoData: l.cotacaoData,
        precoEm: l.precoEm,
        consultadoEm: l.consultadoEm,
      },
    ]),
  );
}

/**
 * Quando cada carta foi perguntada pela última vez desde `desde` — o pulo por
 * frescor da busca. Achada ou não: sem teto de páginas, "a TCGdex não traz
 * preço do Cardmarket para esta carta" é resposta, como no inventário.
 */
export async function consultasDeCandidatasDesde(
  db: Database,
  desde: Date,
): Promise<Map<string, Date>> {
  const linhas = await db
    .select({
      cartaId: precoCandidataCardmarket.cartaId,
      consultadoEm: precoCandidataCardmarket.consultadoEm,
    })
    .from(precoCandidataCardmarket)
    .where(gte(precoCandidataCardmarket.consultadoEm, desde));
  return new Map(linhas.map((l) => [l.cartaId, l.consultadoEm]));
}

const dinheiro = (v: number | null) => (v === null ? null : String(v));

/**
 * Grava (upsert) o preço de uma candidata, convertido pela cotação da rodada.
 * Nunca apaga.
 *
 * Mesma regra do inventário (`gravarPrecoCardmarket`): uma consulta que não
 * achou não sobrescreve um preço já achado. A pergunta, essa, fica registrada
 * sempre (`consultado_em`), para a busca seguinte não repetir a carta.
 */
export async function gravarPrecoCandidata(
  db: Database,
  cartaId: string,
  resultado: ResultadoConsultaCardmarket,
  cotacao: CotacaoPtax,
): Promise<void> {
  const p = resultado.preco;
  const encontrada = p !== null;
  const reais = converterPrecoCardmarket(p, cotacao.cotacao);
  const valores = {
    idProduto: p?.idProduto ?? null,
    idiomaConsulta: resultado.idiomaConsulta,
    foil: p?.foil ?? false,
    tendenciaEur: dinheiro(p?.tendenciaEur ?? null),
    mediaEur: dinheiro(p?.mediaEur ?? null),
    minimoEur: dinheiro(p?.minimoEur ?? null),
    media30Eur: dinheiro(p?.media30Eur ?? null),
    cotacao: encontrada ? String(cotacao.cotacao) : null,
    cotacaoData: encontrada ? cotacao.data : null,
    valorEur: dinheiro(reais.valorEur),
    valor: dinheiro(reais.valor),
    criterioValor: reais.criterioValor,
    atualizadoUpstream: p?.atualizadoEm ?? null,
    encontrada,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(precoCandidataCardmarket)
      .values({
        cartaId,
        ...valores,
        precoEm: encontrada ? sql`now()` : null,
        consultadoEm: sql`now()`,
      })
      .onConflictDoUpdate({
        target: precoCandidataCardmarket.cartaId,
        set: {
          idProduto: sql`excluded.id_produto`,
          idiomaConsulta: sql`excluded.idioma_consulta`,
          foil: sql`excluded.foil`,
          tendenciaEur: sql`excluded.tendencia_eur`,
          mediaEur: sql`excluded.media_eur`,
          minimoEur: sql`excluded.minimo_eur`,
          media30Eur: sql`excluded.media30_eur`,
          cotacao: sql`excluded.cotacao`,
          cotacaoData: sql`excluded.cotacao_data`,
          valorEur: sql`excluded.valor_eur`,
          valor: sql`excluded.valor`,
          criterioValor: sql`excluded.criterio_valor`,
          atualizadoUpstream: sql`excluded.atualizado_upstream`,
          encontrada: sql`excluded.encontrada`,
          precoEm: sql`excluded.preco_em`,
          consultadoEm: sql`excluded.consultado_em`,
        },
        // Só sobrescreve se a nova achou, ou se a antiga também não tinha achado.
        setWhere: sql`excluded.encontrada or not ${precoCandidataCardmarket.encontrada}`,
      });
    // Quando o `setWhere` preservou o preço antigo, a pergunta ainda conta.
    await tx
      .update(precoCandidataCardmarket)
      .set({ consultadoEm: sql`now()` })
      .where(eq(precoCandidataCardmarket.cartaId, cartaId));
  });
}

// --- Rodadas ------------------------------------------------------------------

/**
 * Chave do `pg_advisory_xact_lock` da criação de rodada das candidatas.
 * Número arbitrário e único no app (ver `TRAVA_CRIAR_RODADA` em
 * `precos-liga.ts` e `TRAVA_ENVIO_HOME` em `dex.ts`).
 */
const TRAVA_CRIAR_RODADA_CANDIDATAS = 7_310_004_004;

export type RodadaPrecoCandidata = typeof rodadaPrecoCandidata.$inferSelect;

/**
 * A rodada viva, **de qualquer coleção**: uma busca de candidatas por vez no
 * app inteiro, e não uma por coleção. Duas coleções buscando ao mesmo tempo
 * seriam duas cartas em voo contra a TCGdex, e a rodada do Cardmarket existe
 * para ser uma carta por vez.
 */
export async function rodadaDeCandidatasViva(
  db: Database | Transacao,
  segundosSemBatimento: number,
): Promise<RodadaPrecoCandidata | null> {
  const [linha] = await db
    .select()
    .from(rodadaPrecoCandidata)
    .where(
      and(
        isNull(rodadaPrecoCandidata.concluidaEm),
        sql`${rodadaPrecoCandidata.atualizadoEm} > now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .limit(1);
  return linha ?? null;
}

/**
 * Cria a rodada só se não houver outra viva — checagem e INSERT na mesma
 * transação, serializada pelo lock. Mesmo motivo de `criarRodadaDePrecoSeLivre`:
 * a cotação é buscada entre a primeira checagem e a criação, e dois cliques
 * nesse meio criariam duas rodadas.
 */
export async function criarRodadaDeCandidatasSeLivre(
  db: Database,
  colecaoId: string,
  totalCartas: number,
  segundosSemBatimento: number,
): Promise<{ criada: string } | { viva: RodadaPrecoCandidata }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_CRIAR_RODADA_CANDIDATAS}::bigint)`);
    const viva = await rodadaDeCandidatasViva(tx, segundosSemBatimento);
    if (viva) return { viva };
    const [criada] = await tx
      .insert(rodadaPrecoCandidata)
      .values({ colecaoId, totalCartas })
      .returning({ id: rodadaPrecoCandidata.id });
    return { criada: criada.id };
  });
}

/** Rodada parada por reinício do processo fica "em andamento" para sempre — fecha. */
export async function encerrarRodadasDeCandidatasMortas(
  db: Database,
  segundosSemBatimento: number,
): Promise<number> {
  const fechadas = await db
    .update(rodadaPrecoCandidata)
    .set({
      concluidaEm: sql`now()`,
      erro: "Interrompida antes do fim (o processo foi reiniciado). O que já havia sido consultado está preservado.",
    })
    .where(
      and(
        isNull(rodadaPrecoCandidata.concluidaEm),
        sql`${rodadaPrecoCandidata.atualizadoEm} <= now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .returning({ id: rodadaPrecoCandidata.id });
  return fechadas.length;
}

export async function tocarProgressoDeCandidatas(
  db: Database,
  rodadaId: string,
  dados: { cartasConsultadas: number; cartasComFalha: number; requisicoes: number },
): Promise<void> {
  await db
    .update(rodadaPrecoCandidata)
    .set({ ...dados, atualizadoEm: sql`now()` })
    .where(eq(rodadaPrecoCandidata.id, rodadaId));
}

export async function concluirRodadaDeCandidatas(
  db: Database,
  rodadaId: string,
  dados: { cartasConsultadas: number; cartasComFalha: number; requisicoes: number; erro?: string },
): Promise<void> {
  await db
    .update(rodadaPrecoCandidata)
    .set({ ...dados, erro: dados.erro ?? null, concluidaEm: sql`now()`, atualizadoEm: sql`now()` })
    .where(eq(rodadaPrecoCandidata.id, rodadaId));
}

/** A rodada mais recente desta coleção — a que a tela mostra. */
export async function ultimaRodadaDeCandidatas(
  db: Database,
  colecaoId: string,
): Promise<RodadaPrecoCandidata | null> {
  const [linha] = await db
    .select()
    .from(rodadaPrecoCandidata)
    .where(eq(rodadaPrecoCandidata.colecaoId, colecaoId))
    .orderBy(desc(rodadaPrecoCandidata.criadoEm))
    .limit(1);
  return linha ?? null;
}
