/**
 * Persistência da consulta de preço das cartas especiais. O porquê da
 * seleção, do casamento e do frescor está em
 * `lib/dominio/precos-cartas-especiais.ts`; o do ritmo, em
 * `lib/liga/cliente.ts`. Aqui só se lê e escreve.
 *
 * As rodadas e as fotos servem as duas fontes de preço
 * (`lib/dominio/fonte-preco.ts`): toda função de rodada e de foto recebe a
 * `fonte` — `liga` por padrão, para quem já chamava não mudar — e toda
 * consulta filtra por ela. Os preços em si ficam em tabelas separadas: os
 * da Liga aqui, os do Cardmarket em `precos-cardmarket.ts`.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import {
  cartaCatalogo,
  copia,
  ligaRodadaPreco,
  ligaSnapshotPreco,
  precoCartaCardmarket,
  precoCartaCardmarketHistorico,
  precoCartaLiga,
  precoCartaLigaHistorico,
} from "./schema";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import type { LinhaBuscaLiga } from "@/lib/dominio/liga-busca";
import { comoPrecoDeCarta } from "@/lib/dominio/preco-cardmarket";
import {
  fotoEntraNoGrafico,
  fotografarPrecos,
  rodadaPodeSerExcluida,
  type PontoDaSerie,
} from "@/lib/dominio/historico-precos";
import {
  selecionarCartasParaPreco,
  type CartaParaPreco,
  type ConsultaDePreco,
  type PrecoDeCarta,
} from "@/lib/dominio/precos-cartas-especiais";

/**
 * As cartas especiais que o usuário possui, uma por `carta_id`. Lê as cópias
 * (alocadas ou livres) e, das cartas que elas apontam, todas as fichas — a
 * en e a pt entram no termo de busca da Liga mesmo quando só uma é a
 * possuída, e o conjunto delas diz em que idiomas a fonte Cardmarket pode
 * pedir a ficha à TCGdex.
 */
export async function listarCartasEspeciaisPossuidas(db: Database): Promise<CartaParaPreco[]> {
  const possuidas = await db.selectDistinct({ cartaId: copia.cartaId }).from(copia);
  if (possuidas.length === 0) return [];

  const linhas = await db
    .select({
      cartaId: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      nome: cartaCatalogo.nome,
      setId: cartaCatalogo.setId,
      setNome: cartaCatalogo.setNome,
      setSigla: cartaCatalogo.setSigla,
      localId: cartaCatalogo.localId,
      raridade: cartaCatalogo.raridade,
    })
    .from(cartaCatalogo)
    .where(
      inArray(
        cartaCatalogo.id,
        possuidas.map((p) => p.cartaId),
      ),
    );
  return selecionarCartasParaPreco(linhas);
}

/** O que cada carta consultada desde `desde` guardou — para o pulo por frescor. */
export async function consultasDePrecoDesde(
  db: Database,
  desde: Date,
): Promise<Map<string, ConsultaDePreco>> {
  const linhas = await db
    .select({
      cartaId: precoCartaLiga.cartaId,
      consultadoEm: precoCartaLiga.consultadoEm,
      encontrada: precoCartaLiga.encontrada,
      paginasMax: precoCartaLiga.paginasMax,
    })
    .from(precoCartaLiga)
    .where(gte(precoCartaLiga.consultadoEm, desde));
  return new Map(
    linhas.map((l) => [
      l.cartaId,
      { consultadoEm: new Date(l.consultadoEm), encontrada: l.encontrada, paginasMax: l.paginasMax },
    ]),
  );
}

const dinheiro = (v: number | null) => (v === null ? null : String(v));

/**
 * Grava (upsert) o resultado de uma carta. Nunca apaga.
 *
 * Uma consulta que **não achou** não sobrescreve um preço que já foi achado:
 * a carta pode ter esgotado hoje, e o último preço conhecido, com a data
 * dele, vale mais que um vazio — mesma regra de `escolha_compra` ("carta que
 * não reapareceu guarda o preço de antes"). O custo é que essa carta continua
 * velha e é perguntada de novo a cada rodada, o que é o lado seguro.
 */
export async function gravarPrecoDeCarta(
  db: Database,
  cartaId: string,
  linha: LinhaBuscaLiga | null,
  paginasMax: number,
  rodadaId: string | null = null,
): Promise<void> {
  const valores = {
    cartaId,
    edicaoSigla: linha?.edicaoSigla ?? null,
    edid: linha?.edicaoId ?? null,
    numero: linha?.numero ?? null,
    preco: dinheiro(linha?.preco ?? null),
    precoMedio: dinheiro(linha?.precoMedio ?? null),
    precoMaximo: dinheiro(linha?.precoMaximo ?? null),
    encontrada: linha !== null,
    paginasMax,
    consultadoEm: sql`now()`,
  };
  await db
    .insert(precoCartaLiga)
    .values(valores)
    .onConflictDoUpdate({
      target: precoCartaLiga.cartaId,
      set: {
        edicaoSigla: sql`excluded.edicao_sigla`,
        edid: sql`excluded.edid`,
        numero: sql`excluded.numero`,
        preco: sql`excluded.preco`,
        precoMedio: sql`excluded.preco_medio`,
        precoMaximo: sql`excluded.preco_maximo`,
        encontrada: sql`excluded.encontrada`,
        paginasMax: sql`excluded.paginas_max`,
        consultadoEm: sql`excluded.consultado_em`,
      },
      // Só sobrescreve se a nova achou, ou se a antiga também não tinha achado.
      setWhere: sql`excluded.encontrada or not ${precoCartaLiga.encontrada}`,
    });
  // O histórico registra a consulta como ela foi (inclusive "não achada"),
  // mesmo quando o upsert acima preservou o preço antigo: é o diário de
  // consultas, não o último estado. Só acrescenta.
  await db.insert(precoCartaLigaHistorico).values({
    cartaId,
    rodadaId,
    preco: valores.preco,
    precoMedio: valores.precoMedio,
    precoMaximo: valores.precoMaximo,
    encontrada: valores.encontrada,
  });
}

/** A tabela de preços inteira de uma fonte, no formato do agregador. */
async function precosParaFoto(db: Database, fonte: FontePreco): Promise<PrecoDeCarta[]> {
  if (fonte === "cardmarket") {
    // `comoPrecoDeCarta`: nesta fonte, o "médio" que a foto soma é a
    // tendência (senão a média), e o "mínimo" é o `low` do Cardmarket.
    const linhas = await db
      .select({
        encontrada: precoCartaCardmarket.encontrada,
        minimo: precoCartaCardmarket.minimo,
        tendencia: precoCartaCardmarket.tendencia,
        media: precoCartaCardmarket.media,
      })
      .from(precoCartaCardmarket);
    return linhas.map((l) =>
      comoPrecoDeCarta({
        encontrada: l.encontrada,
        minimo: numero(l.minimo),
        tendencia: numero(l.tendencia),
        media: numero(l.media),
      }),
    );
  }
  const linhas = await db
    .select({
      encontrada: precoCartaLiga.encontrada,
      preco: precoCartaLiga.preco,
      precoMedio: precoCartaLiga.precoMedio,
      precoMaximo: precoCartaLiga.precoMaximo,
    })
    .from(precoCartaLiga);
  return linhas.map((l) => ({
    encontrada: l.encontrada,
    preco: numero(l.preco),
    precoMedio: numero(l.precoMedio),
    precoMaximo: numero(l.precoMaximo),
  }));
}

/**
 * Fotografa a tabela de preços inteira da fonte agora e grava como o ponto
 * da rodada (a agregação é `fotografarPrecos`). Idempotente por rodada:
 * chamar de novo não duplica. Vale também para rodada abortada por
 * bloqueio — o que já foi precificado continua valendo.
 */
export async function registrarFotoDaRodada(
  db: Database,
  rodadaId: string,
  fonte: FontePreco = "liga",
): Promise<void> {
  const foto = fotografarPrecos(await precosParaFoto(db, fonte));
  await db
    .insert(ligaSnapshotPreco)
    .values({
      fonte,
      rodadaId,
      somaMedios: String(foto.somaMedios),
      cartasComPreco: foto.cartasComPreco,
      precoMedioPorCarta: String(foto.precoMedioPorCarta),
      somaMinimos: String(foto.somaMinimos),
    })
    .onConflictDoNothing({ target: ligaSnapshotPreco.rodadaId });
}

/**
 * A série do gráfico: uma foto por rodada concluída, da mais antiga à mais
 * nova. A de rodada interrompida fica de fora (`fotoEntraNoGrafico`).
 *
 * Só as fotos da fonte pedida: cada fonte tem a sua série. A Liga soma o
 * preço médio dela, o Cardmarket soma a tendência convertida — números de
 * natureza diferente, e emendar uma série na outra desenharia uma queda (ou
 * uma alta) que não aconteceu.
 */
export async function listarSerieDePrecos(
  db: Database,
  fonte: FontePreco = "liga",
): Promise<PontoDaSerie[]> {
  const linhas = await db
    .select({
      tiradoEm: ligaSnapshotPreco.tiradoEm,
      somaMedios: ligaSnapshotPreco.somaMedios,
      cartasComPreco: ligaSnapshotPreco.cartasComPreco,
      precoMedioPorCarta: ligaSnapshotPreco.precoMedioPorCarta,
      rodadaId: ligaSnapshotPreco.rodadaId,
      erroDaRodada: ligaRodadaPreco.erro,
    })
    .from(ligaSnapshotPreco)
    .leftJoin(ligaRodadaPreco, eq(ligaRodadaPreco.id, ligaSnapshotPreco.rodadaId))
    .where(eq(ligaSnapshotPreco.fonte, fonte))
    .orderBy(ligaSnapshotPreco.tiradoEm);
  return linhas.filter(fotoEntraNoGrafico).map((l) => ({
    tiradoEm: new Date(l.tiradoEm).toISOString(),
    somaMedios: Number(l.somaMedios),
    cartasComPreco: l.cartasComPreco,
    precoMedioPorCarta: Number(l.precoMedioPorCarta),
  }));
}

export interface PrecoListado {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  preco: number | null;
  precoMedio: number | null;
  precoMaximo: number | null;
  consultadoEm: Date;
}

const numero = (v: string | null) => (v === null ? null : Number(v));
const ORDEM_IDIOMA = { pt: 0, en: 1, jp: 2 } as const;

/** O que a tela de preços mostra de uma carta. */
export interface FichaDeExibicao {
  cartaId: string;
  idioma: "pt" | "en" | "jp";
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
}

/**
 * A ficha que representa cada carta na tela de preços: pt, senão en, senão
 * jp — a mesma escolha para as duas fontes.
 */
export async function fichasDeExibicao(
  db: Database,
  cartaIds: readonly string[],
): Promise<Map<string, FichaDeExibicao>> {
  const exibicao = new Map<string, FichaDeExibicao>();
  if (cartaIds.length === 0) return exibicao;
  const fichas = await db
    .select({
      cartaId: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      nome: cartaCatalogo.nome,
      setNome: cartaCatalogo.setNome,
      localId: cartaCatalogo.localId,
      raridade: cartaCatalogo.raridade,
    })
    .from(cartaCatalogo)
    .where(inArray(cartaCatalogo.id, [...cartaIds]));
  for (const f of fichas) {
    const atual = exibicao.get(f.cartaId);
    if (!atual || ORDEM_IDIOMA[f.idioma] < ORDEM_IDIOMA[atual.idioma]) exibicao.set(f.cartaId, f);
  }
  return exibicao;
}

/** Todo preço guardado, com os dados de exibição da carta (ficha pt, senão en, senão jp). */
export async function listarPrecos(db: Database): Promise<PrecoListado[]> {
  const precos = await db.select().from(precoCartaLiga);
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
        preco: numero(p.preco),
        precoMedio: numero(p.precoMedio),
        precoMaximo: numero(p.precoMaximo),
        consultadoEm: new Date(p.consultadoEm),
      },
    ];
  });
}

/** O valor (médio, senão mínimo) de cada carta com preço — a base da ordem das joias. */
export async function valoresPorCarta(
  db: Database,
  cartaIds: readonly string[],
): Promise<Map<string, number>> {
  if (cartaIds.length === 0) return new Map();
  const linhas = await db
    .select({
      cartaId: precoCartaLiga.cartaId,
      valor: sql<string | null>`coalesce(${precoCartaLiga.precoMedio}, ${precoCartaLiga.preco})`,
    })
    .from(precoCartaLiga)
    .where(and(eq(precoCartaLiga.encontrada, true), inArray(precoCartaLiga.cartaId, [...cartaIds])));
  return new Map(linhas.flatMap((l) => (l.valor === null ? [] : [[l.cartaId, Number(l.valor)] as const])));
}

// --- A rodada ---------------------------------------------------------------

/** Uma rodada na lista "Pesquisas anteriores" da tela. */
export interface RodadaListada {
  id: string;
  criadoEm: Date;
  concluidaEm: Date | null;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  erro: string | null;
  /** O total do ponto que a rodada deixou; nulo quando não deixou foto. */
  somaMedios: number | null;
  /** O ponto aparece no gráfico (`fotoEntraNoGrafico`). */
  noGrafico: boolean;
}

/** As rodadas da fonte, da mais nova à mais antiga, com o ponto que cada uma deixou. */
export async function listarRodadasDePreco(
  db: Database,
  fonte: FontePreco = "liga",
  limite = 50,
): Promise<RodadaListada[]> {
  const linhas = await db
    .select({
      rodada: ligaRodadaPreco,
      somaMedios: ligaSnapshotPreco.somaMedios,
      fotoId: ligaSnapshotPreco.id,
    })
    .from(ligaRodadaPreco)
    .leftJoin(ligaSnapshotPreco, eq(ligaSnapshotPreco.rodadaId, ligaRodadaPreco.id))
    .where(eq(ligaRodadaPreco.fonte, fonte))
    .orderBy(desc(ligaRodadaPreco.criadoEm))
    .limit(limite);
  return linhas.map(({ rodada, somaMedios, fotoId }) => ({
    id: rodada.id,
    criadoEm: new Date(rodada.criadoEm),
    concluidaEm: rodada.concluidaEm === null ? null : new Date(rodada.concluidaEm),
    totalCartas: rodada.totalCartas,
    cartasConsultadas: rodada.cartasConsultadas,
    cartasComFalha: rodada.cartasComFalha,
    requisicoes: rodada.requisicoes,
    erro: rodada.erro,
    somaMedios: somaMedios === null ? null : Number(somaMedios),
    noGrafico: fotoId !== null && fotoEntraNoGrafico({ rodadaId: rodada.id, erroDaRodada: rodada.erro }),
  }));
}

/**
 * Exclui uma rodada encerrada: o registro dela e o ponto que ela deixou no
 * gráfico.
 *
 * **Os preços ficam** — decisão do usuário, 2026-10-11. O que a rodada leu da Liga
 * é preço real, inclusive numa rodada que caiu no meio; apagar devolveria as
 * cartas ao preço anterior e a próxima rodada teria de consultá-las de novo
 * (o frescor de 24 h é contado sobre `preco_carta_liga`). O histórico por
 * carta também fica, só perde o vínculo com a rodada (`rodada_id` nulo, como
 * as linhas do backfill).
 *
 * Vale para as duas fontes, com a mesma regra: a fonte vem da própria
 * rodada, e é ela que diz de qual histórico soltar o vínculo.
 */
export async function excluirRodadaDePreco(
  db: Database,
  rodadaId: string,
): Promise<"excluida" | "naoEncontrada" | "emAndamento"> {
  return db.transaction(async (tx) => {
    const [rodada] = await tx
      .select({ concluidaEm: ligaRodadaPreco.concluidaEm, fonte: ligaRodadaPreco.fonte })
      .from(ligaRodadaPreco)
      .where(eq(ligaRodadaPreco.id, rodadaId))
      .for("update");
    if (!rodada) return "naoEncontrada";
    if (!rodadaPodeSerExcluida(rodada)) return "emAndamento";

    await tx.delete(ligaSnapshotPreco).where(eq(ligaSnapshotPreco.rodadaId, rodadaId));
    if (rodada.fonte === "cardmarket") {
      await tx
        .update(precoCartaCardmarketHistorico)
        .set({ rodadaId: null })
        .where(eq(precoCartaCardmarketHistorico.rodadaId, rodadaId));
    } else {
      await tx
        .update(precoCartaLigaHistorico)
        .set({ rodadaId: null })
        .where(eq(precoCartaLigaHistorico.rodadaId, rodadaId));
    }
    await tx.delete(ligaRodadaPreco).where(eq(ligaRodadaPreco.id, rodadaId));
    return "excluida";
  });
}

export async function criarRodadaDePreco(
  db: Database | Transacao,
  totalCartas: number,
  fonte: FontePreco = "liga",
): Promise<string> {
  const [linha] = await db
    .insert(ligaRodadaPreco)
    .values({ totalCartas, fonte })
    .returning({ id: ligaRodadaPreco.id });
  return linha.id;
}

export async function tocarProgressoDePreco(
  db: Database,
  rodadaId: string,
  dados: { cartasConsultadas: number; cartasComFalha: number; requisicoes: number },
): Promise<void> {
  await db
    .update(ligaRodadaPreco)
    .set({ ...dados, atualizadoEm: sql`now()` })
    .where(eq(ligaRodadaPreco.id, rodadaId));
}

export async function concluirRodadaDePreco(
  db: Database,
  rodadaId: string,
  dados: {
    cartasConsultadas: number;
    cartasComFalha: number;
    requisicoes: number;
    erro?: string;
  },
): Promise<void> {
  await db
    .update(ligaRodadaPreco)
    .set({ ...dados, erro: dados.erro ?? null, concluidaEm: sql`now()`, atualizadoEm: sql`now()` })
    .where(eq(ligaRodadaPreco.id, rodadaId));
}

/**
 * A rodada de preços viva da fonte, se houver — o que impede duas ao mesmo
 * tempo (na Liga, o limitador é por rodada e dobraria o ritmo). A janela vem
 * do pior caso de uma carta na fonte: na Liga, do intervalo, como na
 * varredura (`janelaSemBatimentoSegundos`); no Cardmarket,
 * `JANELA_SEM_BATIMENTO_CARDMARKET_SEGUNDOS`.
 */
export async function rodadaDePrecoViva(
  db: Database | Transacao,
  segundosSemBatimento: number,
  fonte: FontePreco = "liga",
) {
  const [linha] = await db
    .select()
    .from(ligaRodadaPreco)
    .where(
      and(
        eq(ligaRodadaPreco.fonte, fonte),
        isNull(ligaRodadaPreco.concluidaEm),
        sql`${ligaRodadaPreco.atualizadoEm} > now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .limit(1);
  return linha ?? null;
}

/**
 * Chaves do `pg_advisory_xact_lock` da criação de rodada, uma por fonte.
 * Números arbitrários e únicos no app (o envio ao HOME usa outro, em
 * `dex.ts`): com o mesmo número, uma criação esperaria pela outra sem motivo.
 */
const TRAVA_CRIAR_RODADA: Record<FontePreco, number> = {
  liga: 7_310_004_002,
  cardmarket: 7_310_004_003,
};

/**
 * Cria a rodada só se não houver outra viva da mesma fonte — a checagem e o
 * INSERT numa transação só, serializada por fonte.
 *
 * Checar e depois criar, em duas idas ao banco, deixa uma corrida: dois
 * cliques que passam juntos pela checagem criam duas rodadas, e duas rodadas
 * consultam o upstream em paralelo. No Cardmarket a janela é larga, porque a
 * cotação da PTAX é buscada entre a primeira checagem e a criação (até ~40 s).
 * Com o lock, a segunda transação espera a primeira gravar e, em READ
 * COMMITTED, enxerga a rodada nova: sai com a viva, e a rota responde 409.
 */
export async function criarRodadaDePrecoSeLivre(
  db: Database,
  totalCartas: number,
  segundosSemBatimento: number,
  fonte: FontePreco,
): Promise<{ criada: string } | { viva: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_CRIAR_RODADA[fonte]}::bigint)`);
    const viva = await rodadaDePrecoViva(tx, segundosSemBatimento, fonte);
    if (viva) return { viva: viva.id };
    return { criada: await criarRodadaDePreco(tx, totalCartas, fonte) };
  });
}

/**
 * Encerra as rodadas da fonte sem batimento dentro da janela. **Filtra pela
 * fonte de propósito:** a janela é da fonte, e a do Cardmarket (minutos)
 * aplicada a uma rodada da Liga (que pode passar horas entre batimentos)
 * declararia morta uma rodada viva — e liberaria uma segunda em paralelo
 * contra o site deles.
 */
export async function encerrarRodadasDePrecoMortas(
  db: Database,
  segundosSemBatimento: number,
  fonte: FontePreco = "liga",
): Promise<number> {
  const fechadas = await db
    .update(ligaRodadaPreco)
    .set({
      concluidaEm: sql`now()`,
      erro: "Interrompida antes do fim (o processo foi reiniciado). O que já havia sido consultado está preservado.",
    })
    .where(
      and(
        eq(ligaRodadaPreco.fonte, fonte),
        isNull(ligaRodadaPreco.concluidaEm),
        sql`${ligaRodadaPreco.atualizadoEm} <= now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .returning({ id: ligaRodadaPreco.id });
  return fechadas.length;
}

export async function obterUltimaRodadaDePreco(db: Database, fonte: FontePreco = "liga") {
  const [linha] = await db
    .select()
    .from(ligaRodadaPreco)
    .where(eq(ligaRodadaPreco.fonte, fonte))
    .orderBy(desc(ligaRodadaPreco.criadoEm))
    .limit(1);
  return linha ?? null;
}
