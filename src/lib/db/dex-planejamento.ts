/**
 * Living Dex, D3 — troféus, planos, tarefas (com as etapas) e o lote de
 * sessão. Nenhuma consulta toca tabela de cartas.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { catalogoDoJogo } from "@/lib/dominio/dex-disponibilidade";
import {
  recusaSeExcede,
  recusaSeFechada,
  validarNovaOrdem,
  type DadosEtapa,
  type EdicaoEtapa,
} from "@/lib/dominio/dex-etapas";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import {
  planejarLote,
  type Alvo,
  type ContextoSessao,
  type DadosPlano,
  type DadosTarefa,
  type PassoSessao,
  type StatusPlanoDex,
  type StatusTarefaDex,
} from "@/lib/dominio/dex-sessao";
import type { EtapaDexDTO, PlanoDexDTO, TarefaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import type { db as dbPadrao } from "./client";
import { carregarContextoRegistro, comAGuardar, listarFormasDex } from "./dex";
import { dexPlano, dexRegistro, dexSessaoRef, dexTarefa, dexTarefaEtapa, dexTrofeu, dexTrofeuObtido } from "./schema";

type Db = typeof dbPadrao;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// --- Troféus -------------------------------------------------------------

/** Troféus ativos, na ordem do arquivo, com a conquista de cada um. */
export async function listarTrofeus(db: Db): Promise<TrofeuDexDTO[]> {
  const linhas = await db
    .select({
      id: dexTrofeu.id,
      jogoId: dexTrofeu.jogoId,
      tipo: dexTrofeu.tipo,
      nivel: dexTrofeu.nivel,
      ordem: dexTrofeu.ordem,
      textos: dexTrofeu.textos,
      requer: dexTrofeu.requer,
      libera: dexTrofeu.libera,
      regra: dexTrofeu.regra,
      obtidoEm: dexTrofeuObtido.obtidoEm,
      origem: dexTrofeuObtido.origem,
      notas: dexTrofeuObtido.notas,
    })
    .from(dexTrofeu)
    .leftJoin(dexTrofeuObtido, eq(dexTrofeuObtido.trofeuId, dexTrofeu.id))
    .where(eq(dexTrofeu.ativo, true))
    .orderBy(asc(dexTrofeu.ordem));
  return linhas.map(({ obtidoEm, origem, notas, ...t }) => ({
    ...t,
    obtido: obtidoEm && origem ? { em: obtidoEm, origem, notas } : null,
  }));
}

/** Ids dos troféus conquistados. */
export async function idsTrofeusObtidos(db: Db): Promise<Set<string>> {
  const linhas = await db.select({ id: dexTrofeuObtido.trofeuId }).from(dexTrofeuObtido);
  return new Set(linhas.map((l) => l.id));
}

/** Marca um troféu como conquistado pela tela. Marcar de novo não muda nada. */
export async function marcarTrofeu(
  db: Db,
  dados: { trofeuId: string; obtidoEm: string; notas: string | null },
): Promise<{ ok: true } | { ok: false; motivo: Recusa; status: number }> {
  if (!DATA_ISO.test(dados.obtidoEm)) return { ok: false, motivo: recusa("dexDataInvalida", { data: dados.obtidoEm }), status: 400 };
  const [trofeu] = await db
    .select({ id: dexTrofeu.id, tipo: dexTrofeu.tipo })
    .from(dexTrofeu)
    .where(sql`${dexTrofeu.id} = ${dados.trofeuId} and ${dexTrofeu.ativo}`);
  if (!trofeu) return { ok: false, motivo: recusa("dexTrofeuNaoEncontrado"), status: 404 };
  // Troféu do HOME vale pelos registros; marcar à mão criaria uma conquista falsa.
  if (trofeu.tipo === "calculado") return { ok: false, motivo: recusa("dexTrofeuCalculado"), status: 409 };
  await db
    .insert(dexTrofeuObtido)
    .values({ ...dados, origem: "manual" })
    .onConflictDoNothing({ target: dexTrofeuObtido.trofeuId });
  return { ok: true };
}

export async function desmarcarTrofeu(db: Db, trofeuId: string): Promise<boolean> {
  const r = await db
    .delete(dexTrofeuObtido)
    .where(eq(dexTrofeuObtido.trofeuId, trofeuId))
    .returning({ id: dexTrofeuObtido.id });
  return r.length > 0;
}

// --- Planos e tarefas ----------------------------------------------------

const isoOuNulo = (d: Date | null) => (d ? d.toISOString() : null);

/** Todos os planos, os ativos primeiro e os mais novos antes, com as tarefas em ordem. */
export async function listarPlanos(db: Db): Promise<PlanoDexDTO[]> {
  const planos = await db
    .select()
    .from(dexPlano)
    .orderBy(sql`${dexPlano.status} = 'ativo' desc`, desc(dexPlano.inicio), desc(dexPlano.criadoEm));
  if (planos.length === 0) return [];
  const tarefas = await db
    .select()
    .from(dexTarefa)
    .where(
      inArray(
        dexTarefa.planoId,
        planos.map((p) => p.id),
      ),
    )
    .orderBy(asc(dexTarefa.ordem));
  const etapas =
    tarefas.length === 0
      ? []
      : await db
          .select()
          .from(dexTarefaEtapa)
          .where(
            inArray(
              dexTarefaEtapa.tarefaId,
              tarefas.map((t) => t.id),
            ),
          )
          .orderBy(asc(dexTarefaEtapa.ordem));
  const porTarefa = new Map<string, EtapaDexDTO[]>();
  for (const e of etapas) {
    porTarefa.set(e.tarefaId, [
      ...(porTarefa.get(e.tarefaId) ?? []),
      { id: e.id, ordem: e.ordem, texto: e.texto, detalhe: e.detalhe, feita: e.feita, feitaEm: isoOuNulo(e.feitaEm) },
    ]);
  }
  const porPlano = new Map<string, TarefaDexDTO[]>();
  for (const t of tarefas) {
    porPlano.set(t.planoId, [
      ...(porPlano.get(t.planoId) ?? []),
      {
        id: t.id,
        ordem: t.ordem,
        titulo: t.titulo,
        descricao: t.descricao,
        tipo: t.tipo,
        jogoId: t.jogoId,
        formaIds: t.formaIds,
        trofeuId: t.trofeuId,
        status: t.status,
        concluidaEm: isoOuNulo(t.concluidaEm),
        etapas: porTarefa.get(t.id) ?? [],
      },
    ]);
  }
  return planos.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    objetivo: p.objetivo,
    inicio: p.inicio,
    fim: p.fim,
    status: p.status,
    origem: p.origem,
    trofeuIds: p.trofeuIds,
    tarefas: porPlano.get(p.id) ?? [],
  }));
}

async function inserirPlano(tx: Tx | Db, dados: DadosPlano, origem: "sessao" | "manual"): Promise<string> {
  const [p] = await tx
    .insert(dexPlano)
    .values({ ...dados, origem })
    .returning({ id: dexPlano.id });
  return p.id;
}

/** A tarefa entra no fim do plano. */
async function inserirTarefa(tx: Tx | Db, planoId: string, dados: DadosTarefa): Promise<string> {
  const [{ proxima }] = await tx
    .select({ proxima: sql<number>`coalesce(max(${dexTarefa.ordem}), 0)::int + 1` })
    .from(dexTarefa)
    .where(eq(dexTarefa.planoId, planoId));
  const [t] = await tx
    .insert(dexTarefa)
    .values({ ...dados, planoId, ordem: proxima })
    .returning({ id: dexTarefa.id });
  return t.id;
}

async function gravarStatusTarefa(tx: Tx | Db, id: string, status: StatusTarefaDex): Promise<boolean> {
  const r = await tx
    .update(dexTarefa)
    .set({
      status,
      // A data de conclusão é a primeira vez que saiu de aberta; reabrir limpa.
      concluidaEm: status === "aberta" ? null : sql`coalesce(${dexTarefa.concluidaEm}, now())`,
      atualizadoEm: new Date(),
    })
    .where(eq(dexTarefa.id, id))
    .returning({ id: dexTarefa.id });
  return r.length > 0;
}

async function gravarStatusPlano(tx: Tx | Db, id: string, status: StatusPlanoDex): Promise<boolean> {
  const r = await tx
    .update(dexPlano)
    .set({ status, atualizadoEm: new Date() })
    .where(eq(dexPlano.id, id))
    .returning({ id: dexPlano.id });
  return r.length > 0;
}

/** Plano criado pela tela. A validação de forma é a mesma do lote de sessão. */
export async function criarPlanoManual(db: Db, dados: DadosPlano): Promise<string> {
  return inserirPlano(db, dados, "manual");
}

export async function adicionarTarefaManual(db: Db, planoId: string, dados: DadosTarefa): Promise<string | null> {
  const [p] = await db.select({ id: dexPlano.id }).from(dexPlano).where(eq(dexPlano.id, planoId));
  return p ? inserirTarefa(db, planoId, dados) : null;
}

export const mudarStatusTarefa = (db: Db, id: string, status: StatusTarefaDex) => gravarStatusTarefa(db, id, status);
export const mudarStatusPlano = (db: Db, id: string, status: StatusPlanoDex) => gravarStatusPlano(db, id, status);

// --- Etapas --------------------------------------------------------------

type FalhaEtapa = { ok: false; motivo: Recusa; status: number };
const falha = (motivo: Recusa, status: number): FalhaEtapa => ({ ok: false, motivo, status });

/**
 * Confere que a tarefa existe e está aberta num plano ativo, e trava a
 * linha dela até o fim da transação: duas mudanças simultâneas nas etapas
 * da mesma tarefa (outra aba, um `dex:aplicar`) se enfileiram, e o "fim da
 * lista" de uma não é o mesmo número da outra.
 */
async function travarTarefaEditavel(tx: Tx, tarefaId: string): Promise<{ ok: true } | FalhaEtapa> {
  const [t] = await tx
    .select({ status: dexTarefa.status, plano: dexPlano.status })
    .from(dexTarefa)
    .innerJoin(dexPlano, eq(dexPlano.id, dexTarefa.planoId))
    .where(eq(dexTarefa.id, tarefaId))
    .for("update", { of: dexTarefa });
  if (!t) return falha(recusa("dexTarefaNaoEncontrada"), 404);
  const r = recusaSeFechada({ status: t.status }, { status: t.plano });
  return r ? falha(r, 409) : { ok: true };
}

/** A tarefa de uma etapa, já travada e conferida. */
async function travarTarefaDaEtapa(tx: Tx, etapaId: string): Promise<{ ok: true; tarefaId: string } | FalhaEtapa> {
  const [e] = await tx.select({ tarefaId: dexTarefaEtapa.tarefaId }).from(dexTarefaEtapa).where(eq(dexTarefaEtapa.id, etapaId));
  if (!e) return falha(recusa("dexEtapaNaoEncontrada"), 404);
  const r = await travarTarefaEditavel(tx, e.tarefaId);
  return r.ok ? { ok: true, tarefaId: e.tarefaId } : r;
}

/** Acrescenta as etapas no fim da tarefa, na ordem dada. Quem chama já conferiu tarefa e limite. */
async function inserirEtapas(tx: Tx, tarefaId: string, etapas: readonly DadosEtapa[]): Promise<string[]> {
  if (etapas.length === 0) return [];
  const [{ ultima }] = await tx
    .select({ ultima: sql<number>`coalesce(max(${dexTarefaEtapa.ordem}), 0)::int` })
    .from(dexTarefaEtapa)
    .where(eq(dexTarefaEtapa.tarefaId, tarefaId));
  const r = await tx
    .insert(dexTarefaEtapa)
    .values(etapas.map((e, i) => ({ ...e, tarefaId, ordem: ultima + i + 1 })))
    .returning({ id: dexTarefaEtapa.id });
  return r.map((x) => x.id);
}

/** `feita_em` acompanha `feita`: a primeira vez que marcou fica; desmarcar limpa. */
const camposFeita = (feita: boolean) => ({
  feita,
  feitaEm: feita ? sql`coalesce(${dexTarefaEtapa.feitaEm}, now())` : null,
});

/** Renumera as etapas da tarefa de 1 a n, na ordem atual. Só reescreve a linha cuja posição mudou. */
async function renumerarEtapas(tx: Tx, tarefaId: string): Promise<void> {
  const linhas = await tx
    .select({ id: dexTarefaEtapa.id, ordem: dexTarefaEtapa.ordem })
    .from(dexTarefaEtapa)
    .where(eq(dexTarefaEtapa.tarefaId, tarefaId))
    .orderBy(asc(dexTarefaEtapa.ordem), asc(dexTarefaEtapa.criadoEm));
  await gravarOrdem(
    tx,
    linhas.map((l) => l.id),
    new Map(linhas.map((l) => [l.id, l.ordem])),
  );
}

async function gravarOrdem(tx: Tx, ids: readonly string[], atual: ReadonlyMap<string, number>): Promise<void> {
  for (const [i, id] of ids.entries()) {
    if (atual.get(id) === i + 1) continue;
    await tx
      .update(dexTarefaEtapa)
      .set({ ordem: i + 1, atualizadoEm: new Date() })
      .where(eq(dexTarefaEtapa.id, id));
  }
}

/** Etapa nova pela tela: entra no fim. */
export async function adicionarEtapa(db: Db, tarefaId: string, dados: DadosEtapa): Promise<{ ok: true; id: string } | FalhaEtapa> {
  return db.transaction(async (tx) => {
    const t = await travarTarefaEditavel(tx, tarefaId);
    if (!t.ok) return t;
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(dexTarefaEtapa)
      .where(eq(dexTarefaEtapa.tarefaId, tarefaId));
    const demais = recusaSeExcede(total, 1);
    if (demais) return falha(demais, 409);
    const [id] = await inserirEtapas(tx, tarefaId, [dados]);
    return { ok: true, id };
  });
}

/** Muda texto, detalhe e/ou feita. */
export async function editarEtapa(db: Db, etapaId: string, edicao: EdicaoEtapa): Promise<{ ok: true } | FalhaEtapa> {
  return db.transaction(async (tx) => {
    const t = await travarTarefaDaEtapa(tx, etapaId);
    if (!t.ok) return t;
    const { feita, ...textos } = edicao;
    await tx
      .update(dexTarefaEtapa)
      .set({ ...textos, ...(feita === undefined ? {} : camposFeita(feita)), atualizadoEm: new Date() })
      .where(eq(dexTarefaEtapa.id, etapaId));
    return { ok: true };
  });
}

/** Exclui a etapa e fecha o buraco na ordem. */
export async function excluirEtapa(db: Db, etapaId: string): Promise<{ ok: true } | FalhaEtapa> {
  return db.transaction(async (tx) => {
    const t = await travarTarefaDaEtapa(tx, etapaId);
    if (!t.ok) return t;
    await tx.delete(dexTarefaEtapa).where(eq(dexTarefaEtapa.id, etapaId));
    await renumerarEtapas(tx, t.tarefaId);
    return { ok: true };
  });
}

/**
 * Grava a ordem nova (`ids`, a lista inteira), numa transação. Lista que não
 * é exatamente o conjunto atual é recusada (`validarNovaOrdem`).
 */
export async function reordenarEtapas(db: Db, tarefaId: string, ids: unknown): Promise<{ ok: true } | FalhaEtapa> {
  return db.transaction(async (tx) => {
    const t = await travarTarefaEditavel(tx, tarefaId);
    if (!t.ok) return t;
    const linhas = await tx
      .select({ id: dexTarefaEtapa.id, ordem: dexTarefaEtapa.ordem })
      .from(dexTarefaEtapa)
      .where(eq(dexTarefaEtapa.tarefaId, tarefaId));
    const nova = validarNovaOrdem(
      linhas.map((l) => l.id),
      ids,
    );
    if (!Array.isArray(nova)) return falha(nova, 409);
    await gravarOrdem(tx, nova, new Map(linhas.map((l) => [l.id, l.ordem])));
    return { ok: true };
  });
}

// --- Lote de sessão ------------------------------------------------------

export async function carregarContextoSessao(db: Db): Promise<ContextoSessao> {
  const [trofeus, obtidos, refs, planos, tarefas, etapas, registro, formas] = await Promise.all([
    db.select({ id: dexTrofeu.id, jogoId: dexTrofeu.jogoId }).from(dexTrofeu).where(eq(dexTrofeu.ativo, true)),
    idsTrofeusObtidos(db),
    db.select({ ref: dexSessaoRef.ref, tipo: dexSessaoRef.tipo, entidadeId: dexSessaoRef.entidadeId }).from(dexSessaoRef),
    db.select({ id: dexPlano.id, status: dexPlano.status }).from(dexPlano),
    db
      .select({ id: dexTarefa.id, status: dexTarefa.status, plano: dexPlano.status })
      .from(dexTarefa)
      .innerJoin(dexPlano, eq(dexPlano.id, dexTarefa.planoId)),
    db.select({ id: dexTarefaEtapa.id, tarefaId: dexTarefaEtapa.tarefaId }).from(dexTarefaEtapa),
    carregarContextoRegistro(db),
    listarFormasDex(db),
  ]);
  const etapasPorTarefa = new Map<string, number>();
  for (const e of etapas) etapasPorTarefa.set(e.tarefaId, (etapasPorTarefa.get(e.tarefaId) ?? 0) + 1);
  return {
    trofeus: new Map(trofeus.map((t) => [t.id, t.jogoId])),
    obtidos,
    refs: new Map(refs.map((r) => [r.ref, r.tipo])),
    entidades: new Map(refs.flatMap((r) => (r.entidadeId ? [[r.ref, r.entidadeId] as const] : []))),
    planos: new Set(planos.map((p) => p.id)),
    planosAtivos: new Set(planos.filter((p) => p.status === "ativo").map((p) => p.id)),
    tarefas: new Map(
      tarefas.map((t) => [
        t.id,
        { editavel: recusaSeFechada({ status: t.status }, { status: t.plano }) === null, etapas: etapasPorTarefa.get(t.id) ?? 0 },
      ]),
    ),
    etapas: new Map(etapas.map((e) => [e.id, e.tarefaId])),
    registro,
    formasDoJogo: (jogoId) => {
      const c = catalogoDoJogo(jogoId, formas);
      return c ? new Set(c.keys()) : null;
    },
  };
}

export type ResultadoAplicacao =
  | { ok: true; loteJaAplicado: boolean; passos: PassoSessao[]; pulados: string[]; simulado: boolean }
  | { ok: false; erros: string[] };

/**
 * Valida e grava o lote numa transação. Com `simular`, valida e devolve os
 * passos sem gravar nada.
 */
export async function aplicarLoteSessao(
  db: Db,
  json: unknown,
  opcoes: { simular: boolean; hoje: string },
): Promise<ResultadoAplicacao> {
  const plano = planejarLote(json, await carregarContextoSessao(db), opcoes.hoje);
  if (!plano.ok) return plano;
  if (opcoes.simular || plano.loteJaAplicado) return { ...plano, simulado: opcoes.simular };

  await db.transaction(async (tx) => {
    const ids = new Map<string, string>();
    const anteriores = await tx.select().from(dexSessaoRef);
    for (const r of anteriores) if (r.entidadeId) ids.set(r.ref, r.entidadeId);
    const resolver = (a: Alvo) => ("id" in a ? a.id : ids.get(a.ref)!);
    const registrarRef = (ref: string, tipo: string, entidadeId: string | null = null) =>
      tx.insert(dexSessaoRef).values({ ref, tipo, entidadeId });

    for (const p of plano.passos) {
      switch (p.tipo) {
        case "trofeu":
          await tx
            .insert(dexTrofeuObtido)
            .values({ trofeuId: p.trofeuId, obtidoEm: p.obtidoEm, notas: p.notas, origem: "sessao" })
            .onConflictDoNothing({ target: dexTrofeuObtido.trofeuId });
          await registrarRef(p.ref, "trofeu");
          break;
        case "plano": {
          const id = await inserirPlano(tx, p.dados, "sessao");
          ids.set(p.ref, id);
          await registrarRef(p.ref, "plano", id);
          break;
        }
        case "tarefa": {
          const id = await inserirTarefa(tx, resolver(p.plano), p.dados);
          await inserirEtapas(tx, id, p.etapas);
          ids.set(p.ref, id);
          await registrarRef(p.ref, "tarefa", id);
          break;
        }
        case "etapas": {
          // A ref aponta para a tarefa que recebeu as etapas, para o histórico.
          const tarefaId = resolver(p.tarefa);
          await inserirEtapas(tx, tarefaId, p.etapas);
          await registrarRef(p.ref, "etapas", tarefaId);
          break;
        }
        case "status-etapa":
          await tx
            .update(dexTarefaEtapa)
            .set({ ...camposFeita(p.feita), atualizadoEm: new Date() })
            .where(eq(dexTarefaEtapa.id, p.etapaId));
          break;
        case "status-tarefa":
          await gravarStatusTarefa(tx, resolver(p.tarefa), p.status);
          break;
        case "status-plano":
          await gravarStatusPlano(tx, resolver(p.plano), p.status);
          break;
        case "registros":
          for (let i = 0; i < p.registros.length; i += 500) {
            await tx.insert(dexRegistro).values(p.registros.slice(i, i + 500).map(comAGuardar));
          }
          await registrarRef(p.ref, "registros");
          break;
      }
    }
    await registrarRef((json as { ref: string }).ref, "lote");
  });
  return { ...plano, simulado: false };
}

/** Quando foi a última sessão aplicada; `null` se nenhuma. */
export async function ultimaSessao(db: Db): Promise<Date | null> {
  const [l] = await db
    .select({ em: sql<Date | null>`max(${dexSessaoRef.aplicadoEm})` })
    .from(dexSessaoRef)
    .where(eq(dexSessaoRef.tipo, "lote"));
  return l?.em ? new Date(l.em) : null;
}

/** Troféus ativos: id → jogo. Para validar plano e tarefa da tela. */
export async function mapaTrofeusAtivos(db: Db): Promise<Map<string, string>> {
  const linhas = await db.select({ id: dexTrofeu.id, jogoId: dexTrofeu.jogoId }).from(dexTrofeu).where(eq(dexTrofeu.ativo, true));
  return new Map(linhas.map((l) => [l.id, l.jogoId]));
}
