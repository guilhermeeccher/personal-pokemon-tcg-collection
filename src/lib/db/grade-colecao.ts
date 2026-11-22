/**
 * As consultas da grade agregada da v2 (`GET /api/colecoes/:id/grade`). A
 * montagem de cada vaga é pura, em `lib/dominio/grade-colecao.ts`; aqui só se
 * lê.
 *
 * A leitura base é a mesma da v1 (`obterColecaoComVagas`, número fixo de
 * consultas, sem N+1). Por cima dela, número fixo também: a ficha e a data de
 * entrada das cópias alocadas, a ficha das cartas esperadas do set, as
 * melhorias e as escolhas de compra. Tudo numa transação só de leitura,
 * REPEATABLE READ: as cinco leituras veem o mesmo instante, e uma alocação
 * entre elas não desenha uma vaga preenchida sem a cópia, nem uma escolha
 * numa vaga que já foi preenchida.
 */

import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database, Transacao } from "./client";
import { listarMelhoriasDaColecao, obterColecaoComVagas, type ColecaoComVagas } from "./consultas";
import { listarEscolhas } from "./escolhas";
import { cartaCatalogo, copia, vaga } from "./schema";
import { lerChaveVagaSet } from "@/lib/dominio/chave-vaga-set";
import {
  montarVagasDaGrade,
  resolverCartasEsperadas,
  type CartaEsperadaDaGrade,
  type CopiaAlocadaDaGrade,
  type VagaDaGrade,
} from "@/lib/dominio/grade-colecao";
import { ordemIdiomasPorCarta } from "@/lib/dominio/idioma-catalogo";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";

export interface GradeDaColecao extends Omit<ColecaoComVagas, "vagas"> {
  totalVagas: number;
  vagasPreenchidas: number;
  vagas: VagaDaGrade[];
}

/** A ficha e a data de entrada da cópia de cada vaga preenchida. */
async function copiasAlocadas(tx: Transacao, colecaoId: string): Promise<CopiaAlocadaDaGrade[]> {
  const cartaCopia = alias(cartaCatalogo, "carta_copia");
  return tx
    .select({
      vagaId: vaga.id,
      copiaId: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      raridade: cartaCopia.raridade,
      desde: vaga.atualizadoEm,
    })
    .from(vaga)
    .innerJoin(copia, eq(vaga.copiaId, copia.id))
    // Pelo par da própria cópia, como a leitura base: a ficha que identifica
    // a carta, nunca o idioma da coleção (regra 7).
    .leftJoin(
      cartaCopia,
      and(eq(copia.cartaId, cartaCopia.id), eq(copia.idiomaCatalogo, cartaCopia.idioma)),
    )
    .where(eq(vaga.colecaoId, colecaoId));
}

/**
 * A ficha da carta que cada vaga vazia de set espera — a mesma consulta da
 * leitura base (os idiomas da ordem da coleção), resolvida por
 * `resolverCartasEsperadas`.
 */
async function cartasEsperadas(
  tx: Transacao,
  base: ColecaoComVagas,
): Promise<CartaEsperadaDaGrade[]> {
  if (base.tipo !== "set") return [];
  const vazias = base.vagas.filter((v) => v.copiaId === null);
  const setIds = [...new Set(vazias.flatMap((v) => lerChaveVagaSet(v.chave)?.setId ?? []))];
  if (setIds.length === 0) return [];

  const parametro = base.parametro as ParametroSet;
  const linhas = await tx
    .select({
      cartaId: cartaCatalogo.id,
      setId: cartaCatalogo.setId,
      localId: cartaCatalogo.localId,
      idioma: cartaCatalogo.idioma,
      raridade: cartaCatalogo.raridade,
    })
    .from(cartaCatalogo)
    .where(
      and(
        inArray(cartaCatalogo.setId, setIds),
        inArray(cartaCatalogo.idioma, [...ordemIdiomasPorCarta(parametro.idiomaCatalogo)]),
      ),
    );

  return resolverCartasEsperadas(
    vazias.map((v) => v.chave),
    linhas,
    parametro.idiomaCatalogo,
  );
}

/** A grade inteira da coleção, ou `null` se ela não existe. */
export async function lerGradeDaColecao(db: Database, id: string): Promise<GradeDaColecao | null> {
  return db.transaction(
    async (tx) => {
      const base = await obterColecaoComVagas(tx, id);
      if (!base) return null;

      const comCompra = base.tipo === "pokedex" || base.tipo === "set";
      const copias = await copiasAlocadas(tx, id);
      const esperadas = await cartasEsperadas(tx, base);
      // Customizada não tem upgrade nem lista de compra (a vaga dela nasce
      // ao alocar): nem pergunta.
      const melhorias = comCompra ? await listarMelhoriasDaColecao(tx, id) : null;
      const escolhas = comCompra ? await listarEscolhas(tx, id) : [];

      const { vagas, ...resto } = base;
      return {
        ...resto,
        totalVagas: vagas.length,
        vagasPreenchidas: vagas.filter((v) => v.copiaId !== null).length,
        vagas: montarVagasDaGrade({
          tipo: base.tipo,
          vagas,
          copias,
          esperadas,
          melhorias: melhorias?.ok ? melhorias.itens : [],
          escolhas,
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
