/**
 * A triagem de compra do usuário — `escolha_compra`.
 *
 * O porquê de a escolha não viver mais na linha da varredura está no cabeçalho
 * da tabela, em `schema.ts`. Aqui só se lê e escreve.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { Database } from "./client";
import { cartaCatalogo, escolhaCompra, vaga } from "./schema";
import { identidadeDaCarta } from "@/lib/dominio/identidade-carta";

/** Uma carta escolhida, como ela vai para o banco. */
export interface EscolhaNova {
  chave: string;
  especie: string | null;
  nome: string;
  edicaoSigla: string;
  edid: number | null;
  edicaoNome: string;
  numero: string;
  total: string | null;
  caminho: string;
  cartaId: string | null;
  idiomaCatalogo: "pt" | "en" | "jp" | null;
  /** Preço no instante da escolha. Nulo quando não se sabe. */
  preco: number | null;
}

export interface EscolhaSalva extends Omit<EscolhaNova, "preco"> {
  id: string;
  identidade: string;
  preco: number | null;
  /** Quando aquele preço foi visto. Preço sem data é armadilha. */
  precoEm: Date | null;
  /** `false` quando a vaga desta escolha já foi preenchida por uma cópia. */
  vagaVazia: boolean;
  /**
   * Raridade, lida do nosso catálogo na hora — não gravada junto da escolha.
   *
   * É a única coluna do CSV de conferência que não sai da própria escolha, e
   * de propósito: raridade é do catálogo, muda com o sync, e uma cópia
   * congelada aqui envelheceria calada. Nula para carta fora do catálogo.
   */
  raridade: string | null;
}

/**
 * As escolhas de uma coleção, já sabendo quais ainda valem.
 *
 * O `LEFT JOIN` com `vaga` é o que faz a lista encolher sozinha conforme o
 * usuário cadastra as cartas: a escolha de uma vaga preenchida continua
 * guardada, mas marcada como fora da lista. A vaga que nem existe mais
 * (coleção que mudou de escopo) também cai em `vagaVazia = false` — não há o
 * que comprar para ela.
 */
export async function listarEscolhas(
  db: Database,
  colecaoId: string,
): Promise<EscolhaSalva[]> {
  const linhas = await db
    .select({
      escolha: escolhaCompra,
      copiaId: vaga.copiaId,
      vagaId: vaga.id,
      raridade: cartaCatalogo.raridade,
    })
    .from(escolhaCompra)
    .leftJoin(
      vaga,
      and(
        eq(vaga.colecaoId, escolhaCompra.colecaoId),
        eq(vaga.chave, escolhaCompra.chave),
      ),
    )
    // Pelo PAR (id, idioma): a chave de `carta_catalogo` são os dois, e casar
    // só pelo id traria a linha de outro idioma — raridade da carta certa, na
    // versão errada.
    .leftJoin(
      cartaCatalogo,
      and(
        eq(cartaCatalogo.id, escolhaCompra.cartaId),
        eq(cartaCatalogo.idioma, escolhaCompra.idiomaCatalogo),
      ),
    )
    .where(eq(escolhaCompra.colecaoId, colecaoId))
    .orderBy(escolhaCompra.chave, escolhaCompra.criadoEm);

  return linhas.map((l) => ({
    id: l.escolha.id,
    chave: l.escolha.chave,
    identidade: l.escolha.identidade,
    especie: l.escolha.especie,
    nome: l.escolha.nome,
    edicaoSigla: l.escolha.edicaoSigla,
    edid: l.escolha.edid,
    edicaoNome: l.escolha.edicaoNome,
    numero: l.escolha.numero,
    total: l.escolha.total,
    caminho: l.escolha.caminho,
    cartaId: l.escolha.cartaId,
    idiomaCatalogo: l.escolha.idiomaCatalogo,
    preco: l.escolha.preco === null ? null : Number(l.escolha.preco),
    precoEm: l.escolha.precoEm,
    vagaVazia: l.vagaId !== null && l.copiaId === null,
    raridade: l.raridade,
  }));
}

/**
 * Marca cartas como escolhidas.
 *
 * Idempotente: marcar de novo a mesma carta atualiza os dados dela (preço novo,
 * nome corrigido) em vez de duplicar. **Não mexe em `criado_em`** — a data em
 * que o usuário decidiu comprar aquela carta é informação, e uma remarcação
 * não deveria apagá-la.
 */
export async function marcarEscolhas(
  db: Database,
  colecaoId: string,
  cartas: ReadonlyArray<EscolhaNova>,
): Promise<number> {
  if (cartas.length === 0) return 0;

  // Deduplica dentro do próprio lote: `ON CONFLICT` não resolve duas linhas
  // com a mesma chave no MESMO comando ("cannot affect row a second time").
  const unicas = new Map(
    cartas.map((c) => [`${c.chave}|${identidadeDaCarta(c)}`, c] as const),
  );

  const inseridas = await db
    .insert(escolhaCompra)
    .values(
      [...unicas.values()].map((c) => ({
        colecaoId,
        chave: c.chave,
        identidade: identidadeDaCarta(c),
        especie: c.especie,
        nome: c.nome,
        edicaoSigla: c.edicaoSigla,
        edid: c.edid,
        edicaoNome: c.edicaoNome,
        numero: c.numero,
        total: c.total,
        caminho: c.caminho,
        cartaId: c.cartaId,
        idiomaCatalogo: c.idiomaCatalogo,
        preco: c.preco === null ? null : String(c.preco),
        precoEm: c.preco === null ? null : new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [
        escolhaCompra.colecaoId,
        escolhaCompra.chave,
        escolhaCompra.identidade,
      ],
      set: {
        nome: sql`excluded.nome`,
        edicaoNome: sql`excluded.edicao_nome`,
        caminho: sql`excluded.caminho`,
        cartaId: sql`excluded.carta_id`,
        idiomaCatalogo: sql`excluded.idioma_catalogo`,
        preco: sql`excluded.preco`,
        precoEm: sql`excluded.preco_em`,
        atualizadoEm: sql`now()`,
      },
    })
    .returning({ id: escolhaCompra.id });

  return inseridas.length;
}

/**
 * Desmarca cartas. Apagar aqui é o gesto do usuário, não efeito colateral.
 */
export async function desmarcarEscolhas(
  db: Database,
  colecaoId: string,
  alvos: ReadonlyArray<{ chave: string; identidade: string }>,
): Promise<number> {
  if (alvos.length === 0) return 0;

  const removidas = await db
    .delete(escolhaCompra)
    .where(
      and(
        eq(escolhaCompra.colecaoId, colecaoId),
        // Uma condição por alvo, parametrizada pelo Drizzle. A lista é curta
        // (um clique desmarca uma carta), e montar o `IN` de pares como texto
        // cru seria concatenar valor em SQL — não se faz, nem com um usuário
        // só na rede local.
        or(
          ...alvos.map((a) =>
            and(
              eq(escolhaCompra.chave, a.chave),
              eq(escolhaCompra.identidade, a.identidade),
            ),
          ),
        ),
      ),
    )
    .returning({ id: escolhaCompra.id });

  return removidas.length;
}

/**
 * Atualiza o preço das escolhas com o que a varredura acabou de ver.
 *
 * Roda no fim da rodada, e é o que torna útil rodar de novo: a triagem fica,
 * os números se refrescam. A carta que **não** apareceu nesta varredura não é
 * tocada — continua com o preço e a data da última vez, que é a decisão de
 * 2026-09-17 (sumir calada tiraria da lista uma carta que o usuário quer).
 */
export async function atualizarPrecosDasEscolhas(
  db: Database,
  colecaoId: string,
  vistas: ReadonlyArray<{
    chave: string;
    edid: number | null;
    edicaoSigla: string;
    numero: string;
    preco: number;
  }>,
): Promise<number> {
  if (vistas.length === 0) return 0;

  // A mesma carta pode aparecer em mais de uma vaga da rodada; fica o menor
  // preço visto, que é o que a camada 1 sempre mostrou.
  const melhor = new Map<
    string,
    { chave: string; identidade: string; preco: number }
  >();
  for (const v of vistas) {
    const identidade = identidadeDaCarta(v);
    const chaveMapa = `${v.chave}|${identidade}`;
    const atual = melhor.get(chaveMapa);
    if (atual === undefined || v.preco < atual.preco) {
      melhor.set(chaveMapa, { chave: v.chave, identidade, preco: v.preco });
    }
  }

  let atualizadas = 0;
  for (const item of melhor.values()) {
    const linhas = await db
      .update(escolhaCompra)
      .set({
        preco: String(item.preco),
        precoEm: sql`now()`,
        atualizadoEm: sql`now()`,
      })
      .where(
        and(
          eq(escolhaCompra.colecaoId, colecaoId),
          eq(escolhaCompra.chave, item.chave),
          eq(escolhaCompra.identidade, item.identidade),
        ),
      )
      .returning({ id: escolhaCompra.id });
    atualizadas += linhas.length;
  }
  return atualizadas;
}

/** As chaves das vagas ainda vazias — o filtro da lista para colar. */
export async function chavesVazias(
  db: Database,
  colecaoId: string,
): Promise<Set<string>> {
  const linhas = await db
    .select({ chave: vaga.chave })
    .from(vaga)
    .where(and(eq(vaga.colecaoId, colecaoId), isNull(vaga.copiaId)));
  return new Set(linhas.map((l) => l.chave));
}

/** As escolhas de uma coleção, indexadas por `chave|identidade`, para a tela marcar. */
export async function identidadesEscolhidas(
  db: Database,
  colecaoId: string,
): Promise<Set<string>> {
  const linhas = await db
    .select({
      chave: escolhaCompra.chave,
      identidade: escolhaCompra.identidade,
    })
    .from(escolhaCompra)
    .where(eq(escolhaCompra.colecaoId, colecaoId));
  return new Set(linhas.map((l) => `${l.chave}|${l.identidade}`));
}

/** Escolhas por id — usado pela rota de desmarcar, que recebe ids da tela. */
export async function escolhasPorId(
  db: Database,
  colecaoId: string,
  ids: readonly string[],
): Promise<Array<{ chave: string; identidade: string }>> {
  if (ids.length === 0) return [];
  return db
    .select({
      chave: escolhaCompra.chave,
      identidade: escolhaCompra.identidade,
    })
    .from(escolhaCompra)
    .where(
      and(
        eq(escolhaCompra.colecaoId, colecaoId),
        inArray(escolhaCompra.id, [...ids]),
      ),
    );
}
