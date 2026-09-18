/**
 * Consultas de `set_mypcards` — a ponte entre o nosso `set_id` e o id
 * interno do set no mypcards.
 *
 * O porquê da tabela e do formato da URL está em
 * `lib/dominio/mypcards.ts`; aqui só se lê e escreve.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "./client";
import { cartaCatalogo, imagemLocal, setMypcards } from "./schema";
import type { Idioma } from "@/lib/dominio/enums";

export interface MapeamentoSet {
  setId: string;
  numero: number;
  origemUrl: string;
}

export async function obterMapeamentoSet(
  db: Database,
  setId: string,
): Promise<MapeamentoSet | null> {
  const linhas = await db
    .select({
      setId: setMypcards.setId,
      numero: setMypcards.numero,
      origemUrl: setMypcards.origemUrl,
    })
    .from(setMypcards)
    .where(eq(setMypcards.setId, setId))
    .limit(1);
  return linhas[0] ?? null;
}

export async function listarMapeamentos(db: Database): Promise<MapeamentoSet[]> {
  return db
    .select({
      setId: setMypcards.setId,
      numero: setMypcards.numero,
      origemUrl: setMypcards.origemUrl,
    })
    .from(setMypcards)
    .orderBy(setMypcards.setId);
}

/**
 * Grava (ou atualiza) o número de um set. Idempotente: colar o mesmo link
 * duas vezes não muda nada além do `atualizado_em`.
 */
export async function salvarMapeamentoSet(
  db: Database,
  { setId, numero, origemUrl }: MapeamentoSet,
): Promise<void> {
  await db
    .insert(setMypcards)
    .values({ setId, numero, origemUrl })
    .onConflictDoUpdate({
      target: setMypcards.setId,
      set: { numero, origemUrl, atualizadoEm: new Date() },
    });
}

export interface CartaSemFoto {
  cartaId: string;
  idioma: Idioma;
  setId: string;
  localId: string;
  nome: string;
}

/**
 * As cartas de um set mapeado que continuam sem foto **em todas as fontes
 * que já temos** — ou seja, as candidatas ao download do mypcards.
 *
 * O critério repete a cadeia de `imagemDaCarta`, mas ao contrário: a
 * carta entra aqui quando NÃO tem imagem local, NÃO tem `imagem_url` no
 * próprio idioma e NÃO tem no outro idioma ocidental. Se algum desses
 * degraus passar a existir depois, a carta simplesmente para de aparecer
 * nesta lista — o script é idempotente por construção, sem marcar estado.
 *
 * Só pt e en: o site não publica japonês (`lib/dominio/mypcards.ts`).
 */
export async function listarCartasSemFotoDeSetMapeado(
  db: Database,
  setId?: string,
): Promise<CartaSemFoto[]> {
  const semImagemLocal = sql`not exists (
    select 1 from ${imagemLocal}
    where ${imagemLocal.cartaId} = ${cartaCatalogo.id}
      and ${imagemLocal.idioma} = ${cartaCatalogo.idioma}
  )`;

  const semEmprestimo = sql`not exists (
    select 1 from ${cartaCatalogo} as emprestimo
    where emprestimo.id = ${cartaCatalogo.id}
      and emprestimo.idioma = (case when ${cartaCatalogo.idioma} = 'pt' then 'en' else 'pt' end)::idioma
      and emprestimo.imagem_url is not null
  )`;

  return db
    .select({
      cartaId: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      setId: cartaCatalogo.setId,
      localId: cartaCatalogo.localId,
      nome: cartaCatalogo.nome,
    })
    .from(cartaCatalogo)
    .innerJoin(setMypcards, eq(setMypcards.setId, cartaCatalogo.setId))
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        sql`${cartaCatalogo.idioma} in ('pt', 'en')`,
        isNull(cartaCatalogo.imagemUrl),
        semImagemLocal,
        semEmprestimo,
        ...(setId ? [eq(cartaCatalogo.setId, setId)] : []),
      ),
    )
    .orderBy(cartaCatalogo.setId, cartaCatalogo.idioma, cartaCatalogo.localId);
}
