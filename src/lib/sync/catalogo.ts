import { and, eq, lt, notInArray, sql } from "drizzle-orm";

import { ErroBloqueioUpstream } from "@/lib/dominio/bloqueio-upstream";
import { derivarForma } from "@/lib/dominio/forma";
import { decidirInativacaoCatalogo } from "@/lib/dominio/inativacao-catalogo";
import { decidirResyncSet } from "@/lib/dominio/resync-set";
import type { Database } from "@/lib/db/client";
import { cartaCatalogo } from "@/lib/db/schema";

import { mapComConcorrencia } from "./concorrencia";
import {
  type CardDetalhado,
  type Idioma,
  type SetDetalhado,
  listarSets,
  obterCarta,
  obterSet,
} from "./tcgdex";

/**
 * Concorrencia. Reduzida de 40/10 para 4/2 em 2026-08-26, depois de o volume
 * anterior render bloqueio do nosso IP no firewall da TCGdex (ver
 * `lib/dominio/bloqueio-upstream.ts`). O teto de taxa fica no cliente
 * (`lib/sync/limitador.ts`); estes numeros so limitam quantas requisicoes
 * ficam em voo ao mesmo tempo. Nao subir sem motivo.
 */
const CONCORRENCIA_CARDS = Number(process.env.SYNC_CONCORRENCIA_CARDS) || 4;
const CONCORRENCIA_SETS = Number(process.env.SYNC_CONCORRENCIA_SETS) || 2;
const TAMANHO_LOTE_UPSERT = 500;

/**
 * Série a nunca sincronizar (AGENTS.md, contrato do sync; spec §2). Pokémon
 * TCG Pocket é o jogo digital — 2.480 cartas que não existem em papel.
 * Usa `serie.id` (`tcgp`), não o nome: o nome muda por idioma (en:
 * "Pokémon TCG Pocket", pt: "Pokémon Estampas Ilustradas Pocket"), o id é
 * estável. Filtrado logo após `obterSet` — antes de enumerar as cartas do
 * set — para nunca gastar request de carta com uma série excluída.
 */
export const SERIE_EXCLUIDA_ID = "tcgp";

export interface ResultadoSyncIdioma {
  idioma: Idioma;
  setsListados: number;
  setsComFalha: string[];
  setsSemCartas: string[];
  /** Sets pulados por pertencer à série excluída (Pokémon TCG Pocket). */
  setsSeriePocketIgnorados: string[];
  /** Sets inalterados, pulados pelo incremental (nenhuma requisição de carta). */
  setsInalterados: string[];
  /** Cartas revalidadas sem requisição, nos sets inalterados. */
  cartasRevalidadas: number;
  /** Requisições de carta economizadas pelo incremental nesta rodada. */
  requisicoesEconomizadas: number;
  /** Se a rodada ignorou o incremental e revisitou tudo. */
  profundo: boolean;
  cartasUpsertadas: number;
  cartasComErro: string[];
  marcadasInativas: number;
  duracaoMs: number;
}

/**
 * Monta a linha de `carta_catalogo` a partir de um set/carta já resolvidos
 * num idioma. Exportada para ser reaproveitada pelo importador do catálogo
 * japonês a partir do clone local do repositório de dados
 * (`scripts/importar-catalogo-repo.ts`) — ele converte o formato bruto do
 * repositório para `SetDetalhado`/`CardDetalhado` e chama esta mesma
 * função, garantindo que a linha gravada tenha exatamente o mesmo formato
 * de quando vem da API.
 */
export function paraLinha(
  idioma: Idioma,
  setDetail: SetDetalhado,
  carta: CardDetalhado,
) {
  const variants = carta.variants;
  return {
    id: carta.id,
    idioma,
    setId: setDetail.id,
    setNome: setDetail.name,
    setSerie: setDetail.serie.name,
    // Id da série, além do nome. O sync lia `serie.id` só para filtrar a
    // série do TCG Pocket e o descartava — as linhas de pt/en ficaram sem
    // ele até 2026-08-26, quando um script as preencheu a partir do
    // repositório público. Sem gravar aqui, o primeiro set novo que a API
    // trouxesse voltaria a nascer sem id de série: fora do agrupamento
    // por série no seletor e sem a URL de imagem montável.
    setSerieId: setDetail.serie.id,
    // Sigla impressa na carta e data de lançamento do set — vêm do
    // objeto de SET, não do de carta (confirmado ao vivo em 2026-08-25).
    // Nunca inventa: sem abbreviation.official no upstream, fica null.
    setSigla: setDetail.abbreviation?.official ?? null,
    setLancamento: setDetail.releaseDate ?? null,
    localId: carta.localId,
    nome: carta.name,
    categoria: carta.category,
    raridade: carta.rarity ?? null,
    dexIds: carta.dexId ?? [],
    forma: derivarForma(carta.name),
    varianteNormalDisponivel: variants?.normal ?? false,
    varianteReverseDisponivel: variants?.reverse ?? false,
    varianteHoloDisponivel: variants?.holo ?? false,
    variantePrimeiraEdicaoDisponivel: variants?.firstEdition ?? false,
    variantePromoDisponivel: variants?.wPromo ?? false,
    imagemUrl: carta.image ?? null,
    ilustrador: carta.illustrator ?? null,
    setQtdOficial: setDetail.cardCount.official,
    setQtdTotal: setDetail.cardCount.total,
    ativa: true,
    atualizadoEm: new Date(),
  };
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

async function upsertLote(
  db: Database,
  linhas: ReturnType<typeof paraLinha>[],
): Promise<void> {
  if (linhas.length === 0) return;
  await db
    .insert(cartaCatalogo)
    .values(linhas)
    .onConflictDoUpdate({
      target: [cartaCatalogo.id, cartaCatalogo.idioma],
      set: {
        setId: sql`excluded.set_id`,
        setNome: sql`excluded.set_nome`,
        setSerie: sql`excluded.set_serie`,
        setSerieId: sql`excluded.set_serie_id`,
        setSigla: sql`excluded.set_sigla`,
        setLancamento: sql`excluded.set_lancamento`,
        localId: sql`excluded.local_id`,
        nome: sql`excluded.nome`,
        categoria: sql`excluded.categoria`,
        raridade: sql`excluded.raridade`,
        // Número conhecido NUNCA é apagado por um upstream que veio
        // vazio. A TCGdex publica 586 cartas de categoria Pokémon sem
        // `dexId` (o mecanismo de "Pokémon de personagem" e boa parte
        // das ex/Mega japonesas); `pnpm derivar:dex-ids` preenche essas
        // por dedução do nome. Sem esta guarda, a rodada seguinte do
        // sync desfaria a dedução inteira em silêncio — e as cartas
        // sumiriam da Pokédex de novo, sem nada no log.
        //
        // Quando o upstream PASSA a trazer o número, ele vence: a
        // condição só protege contra o vazio.
        dexIds: sql`case
          when cardinality(excluded.dex_ids) > 0 then excluded.dex_ids
          else ${cartaCatalogo.dexIds}
        end`,
        // A marca de dedução acompanha: se o upstream trouxe o número, a
        // linha deixa de ser deduzida.
        dexIdsDerivado: sql`case
          when cardinality(excluded.dex_ids) > 0 then false
          else ${cartaCatalogo.dexIdsDerivado}
        end`,
        forma: sql`excluded.forma`,
        varianteNormalDisponivel: sql`excluded.variante_normal_disponivel`,
        varianteReverseDisponivel: sql`excluded.variante_reverse_disponivel`,
        varianteHoloDisponivel: sql`excluded.variante_holo_disponivel`,
        variantePrimeiraEdicaoDisponivel: sql`excluded.variante_primeira_edicao_disponivel`,
        variantePromoDisponivel: sql`excluded.variante_promo_disponivel`,
        imagemUrl: sql`excluded.imagem_url`,
        ilustrador: sql`excluded.ilustrador`,
        setQtdOficial: sql`excluded.set_qtd_oficial`,
        setQtdTotal: sql`excluded.set_qtd_total`,
        ativa: sql`excluded.ativa`,
        atualizadoEm: sql`excluded.atualizado_em`,
      },
    });
}

/**
 * Sincroniza o catálogo de um idioma. Contrato (AGENTS.md):
 *  - Idempotente: upsert por (id, idioma) via PK — rodar duas vezes não
 *    duplica nem altera a contagem de linhas.
 *  - Nunca apaga: carta que sumir do upstream é marcada `ativa = false`.
 *  - Nunca bloqueia o uso: falha aqui não afeta a app, que lê a tabela local.
 *    Erros de set/carta individuais são logados e pulados, não interrompem
 *    o restante do sync.
 */
/**
 * Revalida no banco um set que o incremental decidiu pular, sem gastar uma
 * única requisição de carta: atualiza os metadados de SET (que vêm do
 * `GET /sets/{id}` já feito nesta rodada e podem mudar sem carta nova —
 * nome, série, sigla, data, contagem oficial) e renova `atualizadoEm`.
 *
 * Renovar o relógio é o que impede a inativação, no fim da rodada, de ler
 * estas cartas como "sumiram do upstream". **Não é a única proteção:**
 * `decidirInativacaoCatalogo` também exclui os sets pulados do UPDATE. São
 * duas defesas independentes de propósito — o acidente aqui seria marcar o
 * catálogo inteiro como inativo em silêncio, com cópias reais apontando
 * para essas linhas.
 *
 * Devolve quantas linhas foram revalidadas.
 */
export async function tocarSetInalterado(
  db: Database,
  idioma: Idioma,
  setDetail: SetDetalhado,
): Promise<number> {
  const tocadas = await db
    .update(cartaCatalogo)
    .set({
      setNome: setDetail.name,
      setSerie: setDetail.serie.name,
      setSerieId: setDetail.serie.id,
      setSigla: setDetail.abbreviation?.official ?? null,
      setLancamento: setDetail.releaseDate ?? null,
      setQtdOficial: setDetail.cardCount.official,
      setQtdTotal: setDetail.cardCount.total,
      atualizadoEm: new Date(),
    })
    .where(
      and(
        eq(cartaCatalogo.idioma, idioma),
        eq(cartaCatalogo.setId, setDetail.id),
        eq(cartaCatalogo.ativa, true),
      ),
    )
    .returning({ id: cartaCatalogo.id });
  return tocadas.length;
}

export interface OpcoesSync {
  /**
   * Revisita todo set carta a carta, ignorando o incremental. Serve para
   * capturar correção de metadado no upstream (raridade, ilustrador, imagem
   * que passou a existir) — o que a comparação de ids não enxerga.
   * Caro: é a rodada completa de ~2h30 nos três idiomas. Use de vez em
   * quando, nunca como padrão semanal.
   */
  profundo?: boolean;
}

export async function sincronizarCatalogo(
  db: Database,
  idioma: Idioma,
  opcoes: OpcoesSync = {},
): Promise<ResultadoSyncIdioma> {
  const profundo = opcoes.profundo ?? process.env.SYNC_PROFUNDO === "1";
  const inicio = Date.now();
  // Marca o instante do início do run: qualquer linha que continuar com
  // atualizadoEm anterior a este instante, ao final, não foi vista nesta
  // rodada — é a base da inativação (ver comentário mais abaixo).
  const inicioDate = new Date(inicio);

  const setsBreves = await listarSets(idioma);

  const setsComFalha: string[] = [];
  const setsDetalhados = await mapComConcorrencia(
    setsBreves,
    CONCORRENCIA_SETS,
    async (setBreve) => {
      try {
        return await obterSet(idioma, setBreve.id);
      } catch (err) {
        // Bloqueio nao e "set com falha": e ordem de parar. Insistir nos
        // demais sets so renova o bloqueio do IP.
        if (err instanceof ErroBloqueioUpstream) throw err;
        setsComFalha.push(setBreve.id);
        console.error(`[sync:${idioma}] falha ao obter set ${setBreve.id}:`, err);
        return null;
      }
    },
  );

  // Fotografia do que já temos gravado neste idioma, numa consulta só. É o
  // lado local da comparação do incremental — sem custo de rede.
  const linhasLocais = await db
    .select({
      id: cartaCatalogo.id,
      setId: cartaCatalogo.setId,
      ativa: cartaCatalogo.ativa,
    })
    .from(cartaCatalogo)
    .where(eq(cartaCatalogo.idioma, idioma));

  const locaisPorSet = new Map<string, { id: string; ativa: boolean }[]>();
  for (const linha of linhasLocais) {
    const lista = locaisPorSet.get(linha.setId);
    if (lista) lista.push({ id: linha.id, ativa: linha.ativa });
    else locaisPorSet.set(linha.setId, [{ id: linha.id, ativa: linha.ativa }]);
  }

  const setsSemCartas: string[] = [];
  const setsSeriePocketIgnorados: string[] = [];
  const setsInalterados: string[] = [];
  const setsParaTocar: SetDetalhado[] = [];
  const referenciasCartas: { setDetail: SetDetalhado; cardId: string }[] = [];
  let requisicoesEconomizadas = 0;

  for (const setDetail of setsDetalhados) {
    if (!setDetail) continue;
    if (setDetail.serie.id === SERIE_EXCLUIDA_ID) {
      setsSeriePocketIgnorados.push(setDetail.id);
      continue;
    }
    if (!setDetail.cards || setDetail.cards.length === 0) {
      setsSemCartas.push(setDetail.id);
      continue;
    }

    const decisao = decidirResyncSet({
      idsUpstream: setDetail.cards.map((c) => c.id),
      linhasLocais: locaisPorSet.get(setDetail.id) ?? [],
      profundo,
    });

    if (!decisao.precisaResync) {
      setsInalterados.push(setDetail.id);
      setsParaTocar.push(setDetail);
      requisicoesEconomizadas += setDetail.cards.length;
      continue;
    }

    for (const cardBreve of setDetail.cards) {
      referenciasCartas.push({ setDetail, cardId: cardBreve.id });
    }
  }

  const cartasComErro: string[] = [];
  // Guarda também o set de cada carta com erro (não só o id da carta): é o
  // que permite excluir da inativação apenas o set afetado, ver mais abaixo.
  const cartasComErroPorSet: { setId: string }[] = [];
  const linhas = await mapComConcorrencia(
    referenciasCartas,
    CONCORRENCIA_CARDS,
    async (ref) => {
      try {
        const carta = await obterCarta(idioma, ref.cardId);
        return paraLinha(idioma, ref.setDetail, carta);
      } catch (err) {
        if (err instanceof ErroBloqueioUpstream) throw err;
        cartasComErro.push(ref.cardId);
        cartasComErroPorSet.push({ setId: ref.setDetail.id });
        console.error(`[sync:${idioma}] falha ao obter carta ${ref.cardId}:`, err);
        return null;
      }
    },
  );

  const linhasValidas = linhas.filter(
    (l): l is NonNullable<typeof l> => l !== null,
  );

  for (const lote of emLotes(linhasValidas, TAMANHO_LOTE_UPSERT)) {
    await upsertLote(db, lote);
  }

  // "Toque" nos sets que o incremental pulou: sem requisição nenhuma.
  // Ver `tocarSetInalterado`.
  let cartasRevalidadas = 0;
  for (const setDetail of setsParaTocar) {
    cartasRevalidadas += await tocarSetInalterado(db, idioma, setDetail);
  }

  // Nunca apaga (contrato do sync): carta que sumiu do upstream vira
  // ativa=false, nunca DELETE — pode haver cópia do usuário apontando pra
  // ela. Em vez de carregar todos os ids vistos nesta rodada num NOT IN
  // gigante (problemático em escala de milhares de linhas), usa o relógio:
  // toda linha upsertada nesta rodada ganha atualizado_em >= inicioDate;
  // qualquer linha ativa que ficou para trás nunca foi tocada agora, logo
  // sumiu do upstream.
  //
  // Isso só vale para um set que a rodada de fato revisitou por completo.
  // `decidirInativacaoCatalogo` (lib/dominio) cobre os dois casos em que
  // não vale: rodada 100% vazia (ex.: API fora do ar) nunca inativa nada; e
  // set que falhou em obterSet ou teve carta com erro em obterCarta fica de
  // fora do UPDATE — falha de rede transitória naquele set não pode ser
  // lida como "sumiu do catálogo". Set que sumiu de vez da listagem
  // `/sets` (nunca foi tentado nesta rodada) não entra nessa exclusão e é
  // inativado normalmente pelo relógio, como o contrato pede.
  const decisaoInativacao = decidirInativacaoCatalogo({
    totalCartasSincronizadas: linhasValidas.length,
    setsComFalha,
    cartasComErro: cartasComErroPorSet,
    totalCartasRevalidadas: cartasRevalidadas,
    setsPulados: setsInalterados,
  });

  let marcadasInativas = 0;
  if (decisaoInativacao.deveInativar) {
    const condicoes = [
      eq(cartaCatalogo.idioma, idioma),
      eq(cartaCatalogo.ativa, true),
      lt(cartaCatalogo.atualizadoEm, inicioDate),
      // Carta criada à mão pelo usuário nunca é inativada: ela não vem
      // do upstream, então o relógio SEMPRE a veria como "sumiu". Sem
      // esta linha, a primeira rodada de sync depois de um cadastro
      // manual apagaria a carta da tela dele — com a cópia apontando
      // para ela. Ver `carta_catalogo.origem` no schema.
      eq(cartaCatalogo.origem, "sync"),
    ];
    if (decisaoInativacao.setsExcluidos.length > 0) {
      condicoes.push(
        notInArray(cartaCatalogo.setId, decisaoInativacao.setsExcluidos),
      );
    }

    const resultado = await db
      .update(cartaCatalogo)
      .set({ ativa: false, atualizadoEm: new Date() })
      .where(and(...condicoes))
      .returning({ id: cartaCatalogo.id });
    marcadasInativas = resultado.length;
  }

  return {
    idioma,
    setsListados: setsBreves.length,
    setsComFalha,
    setsSemCartas,
    setsSeriePocketIgnorados,
    setsInalterados,
    cartasRevalidadas,
    requisicoesEconomizadas,
    profundo,
    cartasUpsertadas: linhasValidas.length,
    cartasComErro,
    marcadasInativas,
    duracaoMs: Date.now() - inicio,
  };
}
