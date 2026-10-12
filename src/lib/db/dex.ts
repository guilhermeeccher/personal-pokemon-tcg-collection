/**
 * Consultas da Living Dex. Nenhuma toca tabela de cartas.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";

import type { CategoriaFormaDex, SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import { naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { ehJogoDex, jogoDex, ordemJogo } from "@/lib/dominio/dex-jogos";
import {
  ehPedidoDeConfirmacao,
  expandirLoteCadastro,
  validarMovimentoEmLote,
  validarNovoRegistro,
  type ContextoRegistroDex,
  type DadosRegistroDex,
  type LoteCadastroDex,
} from "@/lib/dominio/dex-registro";
import { resolverSecoes, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

import type { db as dbPadrao } from "./client";
import { dexForma, dexJogoPossuido, dexRegistro, dexSecao } from "./schema";

type Db = typeof dbPadrao;

/** Vagas ativas, na ordem das caixas do HOME. */
export async function listarFormasDex(db: Db): Promise<FormaDexDTO[]> {
  return db
    .select({
      id: dexForma.id,
      numero: dexForma.numero,
      especie: dexForma.especie,
      forma: dexForma.forma,
      formaPt: dexForma.formaPt,
      categoria: dexForma.categoria,
      geracao: dexForma.geracao,
      lendario: dexForma.lendario,
      mitico: dexForma.mitico,
      shinyObtenivel: dexForma.shinyObtenivel,
      sprite: dexForma.sprite,
      ordem: dexForma.ordem,
    })
    .from(dexForma)
    .where(eq(dexForma.ativa, true))
    .orderBy(asc(dexForma.ordem));
}

export async function lerSecoesDex(db: Db): Promise<SecoesContadas> {
  const linhas: { categoria: CategoriaFormaDex; conta: boolean }[] = await db
    .select({ categoria: dexSecao.categoria, conta: dexSecao.conta })
    .from(dexSecao);
  return resolverSecoes(linhas);
}

export async function definirSecaoDex(db: Db, categoria: SecaoLigavel, conta: boolean): Promise<void> {
  await db
    .insert(dexSecao)
    .values({ categoria, conta })
    .onConflictDoUpdate({
      target: dexSecao.categoria,
      set: { conta, atualizadoEm: sql`now()` },
    });
}

// --- D2: jogos possuídos e registros -------------------------------------

/** Jogos que o usuário tem, na ordem de lançamento, com quantos registros estão em cada um. */
export async function listarJogosPossuidos(db: Db): Promise<JogoPossuidoDTO[]> {
  const linhas = await db
    .select({
      id: dexJogoPossuido.id,
      jogoId: dexJogoPossuido.jogoId,
      desde: dexJogoPossuido.desde,
      notas: dexJogoPossuido.notas,
      ativo: dexJogoPossuido.ativo,
      registrosAqui: sql<number>`(select count(*)::int from ${dexRegistro} where ${dexRegistro.local} = ${dexJogoPossuido.jogoId})`,
    })
    .from(dexJogoPossuido);
  return linhas
    .flatMap((l) => {
      const jogo = jogoDex(l.jogoId);
      // Jogo que saiu do catálogo do código não some da tabela, mas não tem
      // como ser exibido; não acontece hoje, e a guarda evita uma tela quebrada.
      return jogo ? [{ ...l, nome: jogo.nome, conexaoHome: jogo.conexaoHome }] : [];
    })
    .sort((a, b) => ordemJogo(a.jogoId) - ordemJogo(b.jogoId));
}

export async function adicionarJogoPossuido(
  db: Db,
  dados: { jogoId: string; desde: string | null; notas: string | null },
): Promise<{ ok: true } | { ok: false; motivo: Recusa }> {
  if (!ehJogoDex(dados.jogoId)) return { ok: false, motivo: recusa("dexJogoDesconhecido", { jogo: dados.jogoId }) };
  const inseridas = await db
    .insert(dexJogoPossuido)
    .values(dados)
    .onConflictDoNothing({ target: dexJogoPossuido.jogoId })
    .returning({ id: dexJogoPossuido.id });
  if (inseridas.length === 0) {
    return { ok: false, motivo: recusa("dexJogoJaPossuido", { jogo: jogoDex(dados.jogoId)!.nome }) };
  }
  return { ok: true };
}

export async function atualizarJogoPossuido(
  db: Db,
  id: string,
  dados: { desde?: string | null; notas?: string | null; ativo?: boolean },
): Promise<boolean> {
  const r = await db
    .update(dexJogoPossuido)
    .set({ ...dados, atualizadoEm: new Date() })
    .where(eq(dexJogoPossuido.id, id))
    .returning({ id: dexJogoPossuido.id });
  return r.length > 0;
}

/**
 * Tira um jogo da lista. Recusa se algum registro está nele: apagar o jogo
 * deixaria Pokémon num lugar que o sistema não conhece. Para quem parou de
 * jogar, o caminho é desativar.
 */
export async function removerJogoPossuido(
  db: Db,
  id: string,
): Promise<{ ok: true } | { ok: false; motivo: Recusa; status: number }> {
  return db.transaction(async (tx) => {
    const [jogo] = await tx.select().from(dexJogoPossuido).where(eq(dexJogoPossuido.id, id));
    if (!jogo) return { ok: false, motivo: recusa("dexJogoNaoEncontrado"), status: 404 };
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(dexRegistro)
      .where(eq(dexRegistro.local, jogo.jogoId));
    if (total > 0) {
      return {
        ok: false,
        motivo: recusa("dexJogoComRegistros", { jogo: jogoDex(jogo.jogoId)?.nome ?? jogo.jogoId, quantidade: String(total) }),
        status: 409,
      };
    }
    await tx.delete(dexJogoPossuido).where(eq(dexJogoPossuido.id, id));
    return { ok: true };
  });
}

/** O que as regras de registro precisam saber do banco. */
export async function carregarContextoRegistro(db: Db): Promise<ContextoRegistroDex> {
  const [formas, jogos] = await Promise.all([
    db.select({ id: dexForma.id }).from(dexForma).where(eq(dexForma.ativa, true)),
    db.select({ jogoId: dexJogoPossuido.jogoId }).from(dexJogoPossuido).where(eq(dexJogoPossuido.ativo, true)),
  ]);
  return {
    formasAtivas: new Set(formas.map((f) => f.id)),
    jogosAtivos: new Set(jogos.map((j) => j.jogoId)),
    naoTransferiveis: naoTransferiveis(),
  };
}

/**
 * Todos os registros, na ordem de entrada. A tela agrupa, filtra e deriva
 * o estado a partir daqui: são no máximo alguns milhares de linhas curtas,
 * e uma ida ao banco por filtro custaria mais que a lista inteira.
 */
export async function listarRegistrosDex(db: Db): Promise<RegistroDexDTO[]> {
  return db
    .select({
      id: dexRegistro.id,
      formaId: dexRegistro.formaId,
      shiny: dexRegistro.shiny,
      jogoOrigem: dexRegistro.jogoOrigem,
      local: dexRegistro.local,
      capturadoEm: dexRegistro.capturadoEm,
      notas: dexRegistro.notas,
    })
    .from(dexRegistro)
    .orderBy(asc(dexRegistro.criadoEm), asc(dexRegistro.id));
}

/**
 * Cadastro por jogo: grava o lote inteiro numa transação, um registro por
 * Pokémon. Qualquer recusa recusa o lote, e nada é gravado.
 */
export async function criarRegistrosEmLote(
  db: Db,
  lote: LoteCadastroDex,
): Promise<{ ok: true; criados: number } | { ok: false; recusas: Recusa[] }> {
  const r = expandirLoteCadastro(lote, await carregarContextoRegistro(db));
  if (!r.ok) return r;
  if (r.registros.length === 0) return { ok: true, criados: 0 };
  await db.transaction(async (tx) => {
    for (let i = 0; i < r.registros.length; i += 500) {
      await tx.insert(dexRegistro).values(r.registros.slice(i, i + 500));
    }
  });
  return { ok: true, criados: r.registros.length };
}

/** Os registros pedidos, todos existentes, ou `null`. */
async function lerRegistros(db: Db, ids: readonly string[]) {
  if (ids.length === 0) return null;
  const linhas = await db
    .select({
      id: dexRegistro.id,
      formaId: dexRegistro.formaId,
      local: dexRegistro.local,
      jogoOrigem: dexRegistro.jogoOrigem,
    })
    .from(dexRegistro)
    .where(inArray(dexRegistro.id, [...ids]));
  return linhas.length === new Set(ids).size ? linhas : null;
}

/**
 * Corrige um grupo do inventário (forma, shiny, origem, data, notas). O
 * local não muda por aqui, e por isso não é reavaliado: um Pokémon num jogo
 * marcado como parado continua corrigível — o jogo entra no contexto como
 * ativo só para esta validação.
 */
export async function corrigirRegistros(
  db: Db,
  ids: readonly string[],
  dados: Omit<DadosRegistroDex, "local">,
): Promise<{ ok: true } | { ok: false; recusas: Recusa[]; status: number }> {
  const atuais = await lerRegistros(db, ids);
  if (!atuais) return { ok: false, recusas: [recusa("dexRegistroNaoEncontrado")], status: 404 };
  const ctx = await carregarContextoRegistro(db);
  const recusas = new Map<string, Recusa>();
  for (const atual of atuais) {
    const ctxDoRegistro = { ...ctx, jogosAtivos: new Set([...ctx.jogosAtivos, atual.local]) };
    for (const r of validarNovoRegistro({ ...dados, local: atual.local }, ctxDoRegistro)) {
      recusas.set(JSON.stringify(r), r);
    }
  }
  if (recusas.size > 0) return { ok: false, recusas: [...recusas.values()], status: 400 };
  await db
    .update(dexRegistro)
    .set({ ...dados, atualizadoEm: new Date() })
    .where(inArray(dexRegistro.id, [...ids]));
  return { ok: true };
}

/**
 * Move um ou mais registros para o HOME ou para outro jogo, numa transação.
 * Sair de jogo só de envio volta 409 (`dexConfirmarSemVolta`), uma vez para
 * o lote inteiro, até a tela reenviar com a confirmação.
 */
export async function moverRegistros(
  db: Db,
  ids: readonly string[],
  novoLocal: string,
  confirmarSemVolta: boolean,
): Promise<{ ok: true; movidos: number } | { ok: false; motivo: Recusa; status: number }> {
  const atuais = await lerRegistros(db, ids);
  if (!atuais) return { ok: false, motivo: recusa("dexRegistroNaoEncontrado"), status: 404 };
  const motivo = validarMovimentoEmLote(
    atuais.map((a) => ({
      formaId: a.formaId,
      jogoOrigem: a.jogoOrigem,
      localAtual: a.local,
      novoLocal,
      confirmarSemVolta,
    })),
    await carregarContextoRegistro(db),
  );
  if (motivo) return { ok: false, motivo, status: ehPedidoDeConfirmacao(motivo) ? 409 : 400 };
  await db
    .update(dexRegistro)
    .set({ local: novoLocal, atualizadoEm: new Date() })
    .where(inArray(dexRegistro.id, [...ids]));
  return { ok: true, movidos: atuais.length };
}

export async function removerRegistro(db: Db, id: string): Promise<boolean> {
  const r = await db.delete(dexRegistro).where(eq(dexRegistro.id, id)).returning({ id: dexRegistro.id });
  return r.length > 0;
}
