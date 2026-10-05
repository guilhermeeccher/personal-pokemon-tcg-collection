/**
 * Persistência da consulta de preço das cartas especiais. O porquê da
 * seleção, do casamento e do frescor está em
 * `lib/dominio/precos-cartas-especiais.ts`; o do ritmo, em
 * `lib/liga/cliente.ts`. Aqui só se lê e escreve.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "./client";
import {
  cartaCatalogo,
  copia,
  ligaRodadaPreco,
  ligaSnapshotPreco,
  precoCartaLiga,
  precoCartaLigaHistorico,
} from "./schema";
import type { LinhaBuscaLiga } from "@/lib/dominio/liga-busca";
import { fotografarPrecos, type PontoDaSerie } from "@/lib/dominio/historico-precos";
import {
  selecionarCartasParaPreco,
  type CartaParaPreco,
  type ConsultaDePreco,
} from "@/lib/dominio/precos-cartas-especiais";

/**
 * As cartas especiais que o usuário possui, uma por `carta_id`. Lê as cópias
 * (alocadas ou livres) e, das cartas que elas apontam, todas as fichas — a
 * en e a pt entram no termo de busca mesmo quando só uma é a possuída.
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

/**
 * Fotografa a tabela de preços inteira agora e grava como o ponto da rodada
 * (a agregação é `fotografarPrecos`). Idempotente por rodada: chamar de novo
 * não duplica. Vale também para rodada abortada por bloqueio — o que já foi
 * precificado continua valendo.
 */
export async function registrarFotoDaRodada(db: Database, rodadaId: string): Promise<void> {
  const linhas = await db
    .select({
      encontrada: precoCartaLiga.encontrada,
      preco: precoCartaLiga.preco,
      precoMedio: precoCartaLiga.precoMedio,
      precoMaximo: precoCartaLiga.precoMaximo,
    })
    .from(precoCartaLiga);
  const foto = fotografarPrecos(
    linhas.map((l) => ({
      encontrada: l.encontrada,
      preco: numero(l.preco),
      precoMedio: numero(l.precoMedio),
      precoMaximo: numero(l.precoMaximo),
    })),
  );
  await db
    .insert(ligaSnapshotPreco)
    .values({
      rodadaId,
      somaMedios: String(foto.somaMedios),
      cartasComPreco: foto.cartasComPreco,
      precoMedioPorCarta: String(foto.precoMedioPorCarta),
      somaMinimos: String(foto.somaMinimos),
    })
    .onConflictDoNothing({ target: ligaSnapshotPreco.rodadaId });
}

/** A série do gráfico: uma foto por rodada concluída, da mais antiga à mais nova. */
export async function listarSerieDePrecos(db: Database): Promise<PontoDaSerie[]> {
  const linhas = await db.select().from(ligaSnapshotPreco).orderBy(ligaSnapshotPreco.tiradoEm);
  return linhas.map((l) => ({
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

/** Todo preço guardado, com os dados de exibição da carta (ficha pt, senão en, senão jp). */
export async function listarPrecos(db: Database): Promise<PrecoListado[]> {
  const precos = await db.select().from(precoCartaLiga);
  if (precos.length === 0) return [];

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
    .where(
      inArray(
        cartaCatalogo.id,
        precos.map((p) => p.cartaId),
      ),
    );
  const exibicao = new Map<string, (typeof fichas)[number]>();
  for (const f of fichas) {
    const atual = exibicao.get(f.cartaId);
    if (!atual || ORDEM_IDIOMA[f.idioma] < ORDEM_IDIOMA[atual.idioma]) exibicao.set(f.cartaId, f);
  }

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

export async function criarRodadaDePreco(db: Database, totalCartas: number): Promise<string> {
  const [linha] = await db
    .insert(ligaRodadaPreco)
    .values({ totalCartas })
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
 * A rodada de preços viva, se houver — o que impede duas ao mesmo tempo (o
 * limitador é por rodada e dobraria o ritmo). A janela vem do intervalo, como
 * na varredura: `janelaSemBatimentoSegundos`.
 */
export async function rodadaDePrecoViva(db: Database, segundosSemBatimento: number) {
  const [linha] = await db
    .select()
    .from(ligaRodadaPreco)
    .where(
      and(
        isNull(ligaRodadaPreco.concluidaEm),
        sql`${ligaRodadaPreco.atualizadoEm} > now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .limit(1);
  return linha ?? null;
}

export async function encerrarRodadasDePrecoMortas(
  db: Database,
  segundosSemBatimento: number,
): Promise<number> {
  const fechadas = await db
    .update(ligaRodadaPreco)
    .set({
      concluidaEm: sql`now()`,
      erro: "Interrompida antes do fim (o processo foi reiniciado). O que já havia sido consultado está preservado.",
    })
    .where(
      and(
        isNull(ligaRodadaPreco.concluidaEm),
        sql`${ligaRodadaPreco.atualizadoEm} <= now() - make_interval(secs => ${segundosSemBatimento})`,
      ),
    )
    .returning({ id: ligaRodadaPreco.id });
  return fechadas.length;
}

export async function obterUltimaRodadaDePreco(db: Database) {
  const [linha] = await db
    .select()
    .from(ligaRodadaPreco)
    .orderBy(desc(ligaRodadaPreco.criadoEm))
    .limit(1);
  return linha ?? null;
}
