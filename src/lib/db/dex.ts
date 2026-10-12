/**
 * Consultas da Living Dex. Nenhuma toca tabela de cartas.
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import type { CategoriaFormaDex, SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import { ehJogoDex, jogoDex, ordemJogo } from "@/lib/dominio/dex-jogos";
import {
  ehPedidoDeConfirmacao,
  validarMovimento,
  validarNovoRegistro,
  type ContextoRegistroDex,
  type DadosRegistroDex,
} from "@/lib/dominio/dex-registro";
import { resolverSecoes, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import type {
  FormaDexDTO,
  JogoPossuidoDTO,
  RegistroDexDTO,
  RegistroEstadoDTO,
} from "@/lib/dominio/tipos-cliente";

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
      categoria: dexForma.categoria,
      geracao: dexForma.geracao,
      lendario: dexForma.lendario,
      mitico: dexForma.mitico,
      shinyObtenivel: dexForma.shinyObtenivel,
      sprite: dexForma.sprite,
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
  };
}

/** Todos os registros, só com o que deriva o estado das vagas. */
export async function listarRegistrosParaEstado(db: Db): Promise<RegistroEstadoDTO[]> {
  return db
    .select({ formaId: dexRegistro.formaId, shiny: dexRegistro.shiny, local: dexRegistro.local })
    .from(dexRegistro);
}

const colunasRegistro = {
  id: dexRegistro.id,
  formaId: dexRegistro.formaId,
  numero: dexForma.numero,
  especie: dexForma.especie,
  forma: dexForma.forma,
  sprite: dexForma.sprite,
  shiny: dexRegistro.shiny,
  jogoOrigem: dexRegistro.jogoOrigem,
  local: dexRegistro.local,
  capturadoEm: dexRegistro.capturadoEm,
  notas: dexRegistro.notas,
};

export interface FiltroRegistros {
  /** `home`, um id de jogo, ou ausente para todos. */
  local?: string;
  /** Espécie, forma ou número da Pokédex. */
  busca?: string;
  pagina: number;
  tamanhoPagina: number;
}

/** Registros mais recentes primeiro, paginados. */
export async function listarRegistros(
  db: Db,
  filtro: FiltroRegistros,
): Promise<{ itens: RegistroDexDTO[]; total: number }> {
  const condicoes = [];
  if (filtro.local) condicoes.push(eq(dexRegistro.local, filtro.local));
  const busca = filtro.busca?.trim();
  if (busca) {
    const numero = /^#?\d+$/.test(busca) ? Number(busca.replace("#", "")) : null;
    condicoes.push(
      numero !== null
        ? eq(dexForma.numero, numero)
        : or(ilike(dexForma.especie, `%${busca}%`), ilike(dexForma.forma, `%${busca}%`))!,
    );
  }
  const onde = condicoes.length > 0 ? and(...condicoes) : undefined;

  const [itens, [{ total }]] = await Promise.all([
    db
      .select(colunasRegistro)
      .from(dexRegistro)
      .innerJoin(dexForma, eq(dexForma.id, dexRegistro.formaId))
      .where(onde)
      .orderBy(desc(dexRegistro.criadoEm), desc(dexRegistro.id))
      .limit(filtro.tamanhoPagina)
      .offset((filtro.pagina - 1) * filtro.tamanhoPagina),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(dexRegistro)
      .innerJoin(dexForma, eq(dexForma.id, dexRegistro.formaId))
      .where(onde),
  ]);
  return { itens, total };
}

export async function criarRegistro(
  db: Db,
  dados: DadosRegistroDex,
): Promise<{ ok: true; id: string } | { ok: false; recusas: Recusa[] }> {
  const recusas = validarNovoRegistro(dados, await carregarContextoRegistro(db));
  if (recusas.length > 0) return { ok: false, recusas };
  const [linha] = await db.insert(dexRegistro).values(dados).returning({ id: dexRegistro.id });
  return { ok: true, id: linha.id };
}

/**
 * Corrige os dados de um registro (forma, shiny, origem, data, notas). O
 * local não muda por aqui — mover é `moverRegistro`, que tem as regras de
 * ida e volta. A correção é validada como um registro novo no mesmo local.
 */
export async function corrigirRegistro(
  db: Db,
  id: string,
  dados: Omit<DadosRegistroDex, "local">,
): Promise<{ ok: true } | { ok: false; recusas: Recusa[]; status: number }> {
  const [atual] = await db.select({ local: dexRegistro.local }).from(dexRegistro).where(eq(dexRegistro.id, id));
  if (!atual) return { ok: false, recusas: [recusa("dexRegistroNaoEncontrado")], status: 404 };
  // O local não muda numa correção, então ele não é reavaliado: um Pokémon
  // num jogo marcado como parado continua corrigível. O jogo entra no
  // contexto como se estivesse ativo só para esta validação.
  const ctx = await carregarContextoRegistro(db);
  const recusas = validarNovoRegistro(
    { ...dados, local: atual.local },
    { ...ctx, jogosAtivos: new Set([...ctx.jogosAtivos, atual.local]) },
  );
  if (recusas.length > 0) return { ok: false, recusas, status: 400 };
  await db.update(dexRegistro).set({ ...dados, atualizadoEm: new Date() }).where(eq(dexRegistro.id, id));
  return { ok: true };
}

/**
 * Move um registro para o HOME ou para outro jogo. `dexConfirmarSemVolta`
 * volta como 409 até a tela reenviar com a confirmação.
 */
export async function moverRegistro(
  db: Db,
  id: string,
  novoLocal: string,
  confirmarSemVolta: boolean,
): Promise<{ ok: true } | { ok: false; motivo: Recusa; status: number }> {
  const [atual] = await db
    .select({ local: dexRegistro.local, jogoOrigem: dexRegistro.jogoOrigem })
    .from(dexRegistro)
    .where(eq(dexRegistro.id, id));
  if (!atual) return { ok: false, motivo: recusa("dexRegistroNaoEncontrado"), status: 404 };
  const motivo = validarMovimento(
    { jogoOrigem: atual.jogoOrigem, localAtual: atual.local, novoLocal, confirmarSemVolta },
    await carregarContextoRegistro(db),
  );
  if (motivo) return { ok: false, motivo, status: ehPedidoDeConfirmacao(motivo) ? 409 : 400 };
  await db.update(dexRegistro).set({ local: novoLocal, atualizadoEm: new Date() }).where(eq(dexRegistro.id, id));
  return { ok: true };
}

export async function removerRegistro(db: Db, id: string): Promise<boolean> {
  const r = await db.delete(dexRegistro).where(eq(dexRegistro.id, id)).returning({ id: dexRegistro.id });
  return r.length > 0;
}
