/**
 * Grupos de coleções e a ordem da lista (decisão de 2026-11-22). Camada fina
 * sobre o Drizzle: a ordem é de `lib/dominio/ordem-colecoes.ts`, a leitura dos
 * corpos, as séries e as prévias são de `lib/dominio/grupos-colecao.ts`; aqui
 * só se lê, confere sob a trava e grava.
 *
 * Toda escrita roda numa transação com `travarOrganizacaoColecoes`: cada uma
 * lê uma seção e grava posições nela, e duas abas intercaladas perderiam ou
 * duplicariam posição. As recusas saem por `return` antes da primeira
 * escrita — a transação fecha só com as leituras; depois da primeira escrita
 * nada recusa, e uma falha do banco desfaz tudo.
 *
 * Mudar a ordem ou o grupo não toca `colecao.atualizado_em`: a coleção em si
 * não mudou.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import {
  inserirColecaoComVagas,
  listarSetsParaCadastro,
  resolverCriacaoColecao,
  travarOrganizacaoColecoes,
  type SetParaCadastro,
} from "./consultas";
import { cartaCatalogo, colecao, grupoColecao } from "./schema";
import {
  CATEGORIAS_ENERGIA,
  colecoesPorSet,
  conferirPedidoExistentes,
  conferirPedidoFaltantes,
  montarFaltantes,
  parametroDaColecaoFaltante,
  selecionarExistentes,
  seriesOcidentais,
  setsOcidentaisDaSerie,
  type ColecaoExistenteParaGrupo,
  type CriacaoGrupo,
  type EdicaoGrupo,
  type PedidoFaltante,
  type SetFaltante,
} from "@/lib/dominio/grupos-colecao";
import {
  anexarAoFim,
  canonizarIds,
  conferirNovaOrdem,
  idsDaSecao,
  ordenarColecoes,
  ordenarNaSecao,
  posicoesQueMudam,
  proximaOrdem,
} from "@/lib/dominio/ordem-colecoes";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { GrupoColecaoDTO } from "@/lib/dominio/tipos-cliente";

type Leitor = Database | Transacao;

/** Recusa com o status HTTP que a rota devolve. */
export type Falha = { ok: false; motivo: Recusa; status: 400 | 404 | 409 };

const grupoNaoEncontrado = (): Falha => ({ ok: false, motivo: recusa("grupoColecaoNaoEncontrado"), status: 404 });
const colecaoNaoEncontrada = (): Falha => ({ ok: false, motivo: recusa("colecaoNaoEncontrada"), status: 404 });
const ordemDesatualizada = (): Falha => ({ ok: false, motivo: recusa("ordemDeColecoesDesatualizada"), status: 409 });
const grupoSemSerie = (): Falha => ({ ok: false, motivo: recusa("grupoSemSerie"), status: 400 });

// --- Leituras ----------------------------------------------------------------

interface LinhaGrupo {
  id: string;
  nome: string;
  serieId: string | null;
  ordem: number;
  criadoEm: Date;
}

/** Os grupos, na ordem de exibição. */
async function lerGrupos(db: Leitor): Promise<LinhaGrupo[]> {
  const linhas = await db
    .select({
      id: grupoColecao.id,
      nome: grupoColecao.nome,
      serieId: grupoColecao.serieId,
      ordem: grupoColecao.ordem,
      criadoEm: grupoColecao.criadoEm,
    })
    .from(grupoColecao);
  return ordenarNaSecao(linhas);
}

interface LinhaColecaoLeve {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
  grupoId: string | null;
  ordem: number;
  criadoEm: Date;
}

/**
 * Todas as coleções, sem progresso nem avisos, na ordem de exibição — o que
 * reordenar, mover e as prévias de um grupo precisam. `listarColecoes` traria
 * o mesmo pela mesma regra, mas conta vagas e relê o catálogo de cada set.
 */
async function lerColecoesNaOrdem(db: Leitor, grupos: readonly LinhaGrupo[]): Promise<LinhaColecaoLeve[]> {
  const linhas = await db
    .select({
      id: colecao.id,
      nome: colecao.nome,
      tipo: colecao.tipo,
      parametro: colecao.parametro,
      grupoId: colecao.grupoId,
      ordem: colecao.ordem,
      criadoEm: colecao.criadoEm,
    })
    .from(colecao);
  return ordenarColecoes(linhas, grupos);
}

/** O rótulo de cada série ocidental, como o seletor de expansão o mostra. */
function rotulosDasSeries(sets: readonly SetParaCadastro[]): Map<string, string> {
  return new Map(seriesOcidentais(sets).map((s) => [s.serieId, s.rotulo]));
}

/**
 * Os grupos para a tela, em ordem, com o rótulo da série. O catálogo só é
 * lido quando algum grupo tem série; uma série que saiu do catálogo mostra o
 * próprio id em vez de sumir.
 */
export async function listarGruposColecao(db: Leitor): Promise<GrupoColecaoDTO[]> {
  const grupos = await lerGrupos(db);
  const rotulos = grupos.some((g) => g.serieId !== null)
    ? rotulosDasSeries(await listarSetsParaCadastro(db))
    : new Map<string, string>();
  return grupos.map((g) => ({
    id: g.id,
    nome: g.nome,
    serieId: g.serieId,
    serieRotulo: g.serieId === null ? null : (rotulos.get(g.serieId) ?? g.serieId),
    ordem: g.ordem,
  }));
}

/** As séries ocidentais que um grupo pode ligar, na ordem do seletor de expansão. */
export async function listarSeriesParaGrupo(db: Database) {
  return seriesOcidentais(await listarSetsParaCadastro(db));
}

/** Uma série com set ativo em pt ou en. Igualdade estrita: `SM` (japonês) não é `sm`. */
async function serieOcidentalExiste(db: Leitor, serieId: string): Promise<boolean> {
  const [linha] = await db
    .select({ um: sql<number>`1` })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.setSerieId, serieId),
        eq(cartaCatalogo.ativa, true),
        inArray(cartaCatalogo.idioma, ["pt", "en"]),
      ),
    )
    .limit(1);
  return linha !== undefined;
}

// --- Grupos --------------------------------------------------------------------

export async function criarGrupoColecao(
  db: Database,
  dados: CriacaoGrupo,
): Promise<{ ok: true; id: string } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    if (dados.serieId !== null && !(await serieOcidentalExiste(tx, dados.serieId))) {
      return { ok: false as const, motivo: recusa("serieForaDoCatalogoOcidental", { serieId: dados.serieId }), status: 400 as const };
    }
    const ordem = proximaOrdem((await lerGrupos(tx)).map((g) => g.ordem));
    const [linha] = await tx
      .insert(grupoColecao)
      .values({ nome: dados.nome, serieId: dados.serieId, ordem })
      .returning({ id: grupoColecao.id });
    return { ok: true as const, id: linha.id };
  });
}

/**
 * Renomeia e/ou liga ou desliga a série, sob a trava: as ações em lote leem a
 * série do grupo depois da trava, e uma troca de série fora dela poderia cair
 * entre a leitura e a escrita de um lote, que criaria ou moveria coleções pela
 * série que o grupo já não tem.
 */
export async function editarGrupoColecao(
  db: Database,
  id: string,
  edicao: EdicaoGrupo,
): Promise<{ ok: true } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    if (typeof edicao.serieId === "string" && !(await serieOcidentalExiste(tx, edicao.serieId))) {
      return {
        ok: false as const,
        motivo: recusa("serieForaDoCatalogoOcidental", { serieId: edicao.serieId }),
        status: 400 as const,
      };
    }
    const atualizados = await tx
      .update(grupoColecao)
      .set({ ...edicao, atualizadoEm: new Date() })
      .where(eq(grupoColecao.id, id))
      .returning({ id: grupoColecao.id });
    return atualizados.length > 0 ? { ok: true as const } : grupoNaoEncontrado();
  });
}

/**
 * Exclui o grupo, nunca uma coleção: as dele vão para o fim de "sem grupo",
 * na ordem que tinham, na mesma transação. O `on delete set null` da FK é só a
 * rede de segurança — sozinho, deixaria as coleções com as posições do grupo
 * misturadas às de "sem grupo".
 */
export async function excluirGrupoColecao(db: Database, id: string): Promise<{ ok: true } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    if (!grupos.some((g) => g.id === id)) return grupoNaoEncontrado();
    const colecoes = await lerColecoesNaOrdem(tx, grupos);
    const semGrupo = colecoes.filter((c) => c.grupoId === null).map((c) => c.ordem);
    for (const p of anexarAoFim(idsDaSecao(colecoes, id), semGrupo)) {
      await tx.update(colecao).set({ grupoId: null, ordem: p.ordem }).where(eq(colecao.id, p.id));
    }
    await tx.delete(grupoColecao).where(eq(grupoColecao.id, id));
    return { ok: true as const };
  });
}

/** Reordena os grupos: `pedida` tem de ser exatamente o conjunto atual (409 se velha). */
export async function reordenarGruposColecao(
  db: Database,
  pedida: unknown,
): Promise<{ ok: true } | Falha | { ok: false; formato: true }> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    const conferida = conferirNovaOrdem(grupos.map((g) => g.id), canonizarIds(pedida));
    if (!conferida.ok) {
      return conferida.motivo === "formato" ? { ok: false as const, formato: true as const } : ordemDesatualizada();
    }
    const atual = new Map(grupos.map((g) => [g.id, g.ordem]));
    for (const p of posicoesQueMudam(conferida.ids, atual)) {
      await tx.update(grupoColecao).set({ ordem: p.ordem }).where(eq(grupoColecao.id, p.id));
    }
    return { ok: true as const };
  });
}

// --- Coleções dentro dos grupos ----------------------------------------------

/** Renumera 0..n-1 as seções dadas, a partir do estado (já alterado em memória) de `colecoes`. */
async function renumerarSecoes(
  tx: Transacao,
  colecoes: readonly LinhaColecaoLeve[],
  secoes: Iterable<string | null>,
): Promise<void> {
  const atual = new Map(colecoes.map((c) => [c.id, c.ordem]));
  for (const grupoId of new Set(secoes)) {
    for (const p of posicoesQueMudam(idsDaSecao(colecoes, grupoId), atual)) {
      await tx.update(colecao).set({ ordem: p.ordem }).where(eq(colecao.id, p.id));
    }
  }
}

/**
 * Reordena as coleções de uma seção (`grupoId` nulo = "sem grupo"): `pedida`
 * tem de ser exatamente as coleções dela hoje (409 se velha, inclusive quando
 * o grupo da seção já não existe).
 */
export async function reordenarColecoes(
  db: Database,
  grupoId: string | null,
  pedida: unknown,
): Promise<{ ok: true } | Falha | { ok: false; formato: true }> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    // A seção sumiu (outra aba excluiu o grupo): a lista que a tela mandou é
    // velha, e é isso que a resposta diz — 409, não 404.
    if (grupoId !== null && !grupos.some((g) => g.id === grupoId)) return ordemDesatualizada();
    const colecoes = await lerColecoesNaOrdem(tx, grupos);
    const conferida = conferirNovaOrdem(idsDaSecao(colecoes, grupoId), canonizarIds(pedida));
    if (!conferida.ok) {
      return conferida.motivo === "formato" ? { ok: false as const, formato: true as const } : ordemDesatualizada();
    }
    const atual = new Map(colecoes.map((c) => [c.id, c.ordem]));
    for (const p of posicoesQueMudam(conferida.ids, atual)) {
      await tx.update(colecao).set({ ordem: p.ordem }).where(eq(colecao.id, p.id));
    }
    return { ok: true as const };
  });
}

/**
 * Move uma coleção para o fim de outro grupo (ou de "sem grupo") e renumera a
 * seção que ela deixou. Para o mesmo grupo, nada muda.
 */
export async function moverColecaoParaGrupo(
  db: Database,
  colecaoId: string,
  grupoId: string | null,
): Promise<{ ok: true } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    const colecoes = await lerColecoesNaOrdem(tx, grupos);
    const alvo = colecoes.find((c) => c.id === colecaoId);
    if (!alvo) return colecaoNaoEncontrada();
    if (grupoId !== null && !grupos.some((g) => g.id === grupoId)) return grupoNaoEncontrado();
    if (alvo.grupoId === grupoId) return { ok: true as const };

    const origem = alvo.grupoId;
    const ordem = proximaOrdem(colecoes.filter((c) => c.grupoId === grupoId).map((c) => c.ordem));
    await tx.update(colecao).set({ grupoId, ordem }).where(eq(colecao.id, colecaoId));
    alvo.grupoId = grupoId;
    alvo.ordem = ordem;
    await renumerarSecoes(tx, colecoes, [origem]);
    return { ok: true as const };
  });
}

// --- Criar as que faltam -------------------------------------------------------

/**
 * A prévia de "criar as que faltam" a partir do estado lido: os sets
 * ocidentais da série, cada um com quantas cartas ativas tem e quantas são
 * Energia (para `motivoDesmarcado`), e as coleções que já os têm na receita.
 */
async function lerFaltantes(
  db: Leitor,
  serieId: string,
  colecoes: readonly LinhaColecaoLeve[],
): Promise<{ serieRotulo: string; sets: SetFaltante[] }> {
  const todos = await listarSetsParaCadastro(db);
  const daSerie = setsOcidentaisDaSerie(todos, serieId);
  const contagens =
    daSerie.length === 0
      ? []
      : await db
          .select({
            setId: cartaCatalogo.setId,
            ativas: sql<number>`count(*)::int`,
            energia: sql<number>`count(*) filter (where ${inArray(cartaCatalogo.categoria, [...CATEGORIAS_ENERGIA])})::int`,
          })
          .from(cartaCatalogo)
          .where(
            and(
              eq(cartaCatalogo.ativa, true),
              inArray(cartaCatalogo.idioma, ["pt", "en"]),
              inArray(
                cartaCatalogo.setId,
                daSerie.map((s) => s.setId),
              ),
            ),
          )
          .groupBy(cartaCatalogo.setId);
  const porSet = new Map(contagens.map((c) => [c.setId, c]));
  return {
    serieRotulo: rotulosDasSeries(todos).get(serieId) ?? serieId,
    sets: montarFaltantes(
      daSerie.map((s) => ({
        ...s,
        cartasAtivas: porSet.get(s.setId)?.ativas ?? 0,
        cartasEnergia: porSet.get(s.setId)?.energia ?? 0,
      })),
      colecoesPorSet(colecoes),
    ),
  };
}

export async function obterFaltantesDoGrupo(
  db: Database,
  grupoId: string,
): Promise<{ ok: true; serieId: string; serieRotulo: string; sets: SetFaltante[] } | Falha> {
  const grupos = await lerGrupos(db);
  const grupo = grupos.find((g) => g.id === grupoId);
  if (!grupo) return grupoNaoEncontrado();
  if (grupo.serieId === null) return grupoSemSerie();
  const colecoes = await lerColecoesNaOrdem(db, grupos);
  return { ok: true, serieId: grupo.serieId, ...(await lerFaltantes(db, grupo.serieId, colecoes)) };
}

/**
 * Cria as coleções pedidas, uma por set, numa transação só — todas ou
 * nenhuma —, no fim do grupo, em ordem de lançamento. Cada uma passa
 * exatamente pela resolução de `POST /api/colecoes` (`resolverCriacaoColecao`:
 * a receita no catálogo, a regra 4, o caso sem numeração oficial) e é gravada
 * pelo mesmo `inserirColecaoComVagas`.
 *
 * A trava serializa contra outra aba e contra a criação avulsa: a prévia é
 * relida depois dela, e um set que ganhou coleção nesse meio tempo recusa o
 * pedido inteiro (409) em vez de nascer duas vezes. Toda resolução acontece
 * antes da primeira escrita, então qualquer recusa sai sem nada gravado.
 */
export async function criarFaltantesDoGrupo(
  db: Database,
  grupoId: string,
  pedido: readonly PedidoFaltante[],
): Promise<{ ok: true; criadas: { id: string; nome: string }[] } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    const grupo = grupos.find((g) => g.id === grupoId);
    if (!grupo) return grupoNaoEncontrado();
    if (grupo.serieId === null) return grupoSemSerie();
    const colecoes = await lerColecoesNaOrdem(tx, grupos);
    const { sets } = await lerFaltantes(tx, grupo.serieId, colecoes);

    const conferido = conferirPedidoFaltantes(pedido, sets);
    if (!conferido.ok) {
      const status = conferido.recusa.chave === "setJaTemColecao" ? 409 : 400;
      return { ok: false as const, motivo: conferido.recusa, status: status as 400 | 409 };
    }

    const resolvidas = [];
    for (const p of conferido.pedido) {
      const nova = {
        nome: p.nome,
        tipo: "set" as const,
        parametro: parametroDaColecaoFaltante(p.setId),
        idiomaExigido: null,
        notas: null,
      };
      const resolucao = await resolverCriacaoColecao(tx, nova);
      if (!resolucao.ok) return { ok: false as const, motivo: resolucao.motivo, status: 400 as const };
      resolvidas.push({ ...nova, chaves: resolucao.chaves });
    }

    const inicio = proximaOrdem(colecoes.filter((c) => c.grupoId === grupoId).map((c) => c.ordem));
    const criadas: { id: string; nome: string }[] = [];
    for (const [i, dados] of resolvidas.entries()) {
      const { id } = await inserirColecaoComVagas(tx, dados, { grupoId, ordem: inicio + i });
      criadas.push({ id, nome: dados.nome });
    }
    return { ok: true as const, criadas };
  });
}

// --- Trazer as que já existem ----------------------------------------------------

async function lerExistentes(
  db: Leitor,
  grupo: LinhaGrupo & { serieId: string },
  grupos: readonly LinhaGrupo[],
  colecoes: readonly LinhaColecaoLeve[],
): Promise<ColecaoExistenteParaGrupo[]> {
  const daSerie = setsOcidentaisDaSerie(await listarSetsParaCadastro(db), grupo.serieId);
  return selecionarExistentes(
    colecoes,
    new Set(daSerie.map((s) => s.setId)),
    grupo.id,
    new Map(grupos.map((g) => [g.id, g.nome])),
  );
}

export async function obterExistentesParaGrupo(
  db: Database,
  grupoId: string,
): Promise<{ ok: true; colecoes: ColecaoExistenteParaGrupo[] } | Falha> {
  const grupos = await lerGrupos(db);
  const grupo = grupos.find((g) => g.id === grupoId);
  if (!grupo) return grupoNaoEncontrado();
  if (grupo.serieId === null) return grupoSemSerie();
  const colecoes = await lerColecoesNaOrdem(db, grupos);
  return { ok: true, colecoes: await lerExistentes(db, { ...grupo, serieId: grupo.serieId }, grupos, colecoes) };
}

/**
 * Traz as coleções pedidas para o fim do grupo, na ordem da lista, e renumera
 * as seções que elas deixaram. Um id fora dos candidatos recusa tudo (409):
 * a tela estava velha.
 */
export async function trazerExistentesParaGrupo(
  db: Database,
  grupoId: string,
  ids: readonly string[],
): Promise<{ ok: true; movidas: number } | Falha> {
  return db.transaction(async (tx) => {
    await travarOrganizacaoColecoes(tx);
    const grupos = await lerGrupos(tx);
    const grupo = grupos.find((g) => g.id === grupoId);
    if (!grupo) return grupoNaoEncontrado();
    if (grupo.serieId === null) return grupoSemSerie();
    const colecoes = await lerColecoesNaOrdem(tx, grupos);
    const candidatas = await lerExistentes(tx, { ...grupo, serieId: grupo.serieId }, grupos, colecoes);
    const conferido = conferirPedidoExistentes(ids, candidatas);
    if (!conferido.ok) return { ok: false as const, motivo: conferido.recusa, status: 409 as const };

    const porId = new Map(colecoes.map((c) => [c.id, c]));
    const origens = conferido.ids.map((id) => porId.get(id)?.grupoId ?? null);
    const posicoes = anexarAoFim(
      conferido.ids,
      colecoes.filter((c) => c.grupoId === grupoId).map((c) => c.ordem),
    );
    for (const p of posicoes) {
      await tx.update(colecao).set({ grupoId, ordem: p.ordem }).where(eq(colecao.id, p.id));
      const c = porId.get(p.id);
      if (c) {
        c.grupoId = grupoId;
        c.ordem = p.ordem;
      }
    }
    await renumerarSecoes(tx, colecoes, origens);
    return { ok: true as const, movidas: conferido.ids.length };
  });
}
