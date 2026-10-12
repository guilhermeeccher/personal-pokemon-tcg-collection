/**
 * Living Dex, D3 — troféus, planos, tarefas e o lote de sessão. Nenhuma
 * consulta toca tabela de cartas.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { catalogoDoJogo } from "@/lib/dominio/dex-disponibilidade";
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
import type { PlanoDexDTO, TarefaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import type { db as dbPadrao } from "./client";
import { carregarContextoRegistro, listarFormasDex } from "./dex";
import { dexPlano, dexRegistro, dexSessaoRef, dexTarefa, dexTrofeu, dexTrofeuObtido } from "./schema";

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

// --- Lote de sessão ------------------------------------------------------

export async function carregarContextoSessao(db: Db): Promise<ContextoSessao> {
  const [trofeus, obtidos, refs, planos, tarefas, registro, formas] = await Promise.all([
    db.select({ id: dexTrofeu.id, jogoId: dexTrofeu.jogoId }).from(dexTrofeu).where(eq(dexTrofeu.ativo, true)),
    idsTrofeusObtidos(db),
    db.select({ ref: dexSessaoRef.ref, tipo: dexSessaoRef.tipo }).from(dexSessaoRef),
    db.select({ id: dexPlano.id }).from(dexPlano),
    db.select({ id: dexTarefa.id }).from(dexTarefa),
    carregarContextoRegistro(db),
    listarFormasDex(db),
  ]);
  return {
    trofeus: new Map(trofeus.map((t) => [t.id, t.jogoId])),
    obtidos,
    refs: new Map(refs.map((r) => [r.ref, r.tipo])),
    planos: new Set(planos.map((p) => p.id)),
    tarefas: new Set(tarefas.map((t) => t.id)),
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
          ids.set(p.ref, id);
          await registrarRef(p.ref, "tarefa", id);
          break;
        }
        case "status-tarefa":
          await gravarStatusTarefa(tx, resolver(p.tarefa), p.status);
          break;
        case "status-plano":
          await gravarStatusPlano(tx, resolver(p.plano), p.status);
          break;
        case "registros":
          for (let i = 0; i < p.registros.length; i += 500) {
            await tx.insert(dexRegistro).values(p.registros.slice(i, i + 500));
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
