/**
 * Consultas de `set_mypcards` — a ponte entre o nosso `set_id` e o id
 * interno do set no mypcards.
 *
 * O porquê da tabela e do formato da URL está em
 * `lib/dominio/mypcards.ts`; aqui só se lê e escreve.
 */

import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "./client";
import { cartaCatalogo, imagemLocal, setMypcards } from "./schema";
import { urlCatalogoNaoAusente, urlDeduzidaImagem } from "./veredicto-imagem-cdn";
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
 * Uma linha de `cartaCatalogo` é candidata ao download do mypcards quando
 * não tem foto **do próprio idioma** nem foto **oficial** da outra língua
 * ocidental:
 *
 * - imagem local da própria linha, de qualquer origem (enviada, por link,
 *   do mypcards);
 * - `imagem_url` da própria linha que não foi verificada como ausente
 *   (`urlCatalogoNaoAusente`, a regra do degrau 2);
 * - arquivo do CDN da própria linha confirmado pela verificação
 *   (`imagem_cdn_existe = true`, com URL deduzível — o degrau 4);
 * - `imagem_url` da outra língua (mesmo `id`), pela mesma regra do degrau 2.
 *
 * **Não é a cadeia de imagem (`imagemDaCarta`), de propósito:** o scan do
 * mypcards emprestado da outra língua não tira a carta da lista, porque
 * baixar o scan no idioma certo troca uma foto emprestada pela da própria
 * carta. Já a foto oficial da outra língua tira — é a mesma arte, e o
 * download não melhoraria nada que justificasse a requisição. Se alguma
 * dessas fontes passar a existir depois, a carta simplesmente para de
 * aparecer nesta lista — o script é idempotente por construção, sem marcar
 * estado.
 *
 * Exportada para o teste da forma do SQL (`mypcards.test.ts`).
 */
export function semFotoParaMypcards(): SQL {
  const semImagemLocal = sql`not exists (
    select 1 from ${imagemLocal}
    where ${imagemLocal.cartaId} = ${cartaCatalogo.id}
      and ${imagemLocal.idioma} = ${cartaCatalogo.idioma}
  )`;

  const semUrlPropria = sql`${urlCatalogoNaoAusente(cartaCatalogo.imagemUrl, cartaCatalogo.imagemCdnExiste)} is null`;

  const semCdnVerificado = sql`not (
    ${cartaCatalogo.imagemCdnExiste} is true
    and ${urlDeduzidaImagem(cartaCatalogo)} is not null
  )`;

  const semOficialDaOutraLingua = sql`not exists (
    select 1 from ${cartaCatalogo} as emprestimo
    where emprestimo.id = ${cartaCatalogo.id}
      and emprestimo.idioma = (case when ${cartaCatalogo.idioma} = 'pt' then 'en' else 'pt' end)::idioma
      and ${urlCatalogoNaoAusente(sql`emprestimo.imagem_url`, sql`emprestimo.imagem_cdn_existe`)} is not null
  )`;

  return sql`(${semImagemLocal} and ${semUrlPropria} and ${semCdnVerificado} and ${semOficialDaOutraLingua})`;
}

/**
 * As cartas de um set mapeado que continuam sem foto própria — as
 * candidatas ao download do mypcards (critério em `semFotoParaMypcards`).
 *
 * Só pt e en: o site não publica japonês (`lib/dominio/mypcards.ts`).
 */
export async function listarCartasSemFotoDeSetMapeado(
  db: Database,
  setId?: string,
): Promise<CartaSemFoto[]> {
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
        semFotoParaMypcards(),
        ...(setId ? [eq(cartaCatalogo.setId, setId)] : []),
      ),
    )
    .orderBy(cartaCatalogo.setId, cartaCatalogo.idioma, cartaCatalogo.localId);
}
