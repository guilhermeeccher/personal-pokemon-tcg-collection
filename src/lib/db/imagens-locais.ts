/**
 * Consultas de `imagem_local` (tarefa "carta sem foto", 2026-08-26).
 * Separado de `lib/db/consultas.ts` de propósito: é uma tabela nova, sem
 * relação com as consultas de inventário/coleção que já vivem lá, e fica
 * mais fácil auditar o CRUD completo de um recurso pequeno num arquivo
 * dedicado. A cadeia em `consultas.ts` (`imagemDaCarta`/`origemDaImagem`)
 * continua sendo o único ponto que decide a URL exibida — este arquivo só
 * lê/escreve a tabela.
 */

import { and, eq } from "drizzle-orm";

import type { Database } from "./client";
import { imagemLocal } from "./schema";
import type { Idioma } from "@/lib/dominio/enums";

/**
 * Derivado do enum do schema, nunca repetido à mão: foi um union fixo
 * (`"upload" | "url"`) que quebrou o build quando `mypcards` entrou.
 */
export type OrigemImagemLocal = (typeof imagemLocal.origem.enumValues)[number];

export interface ImagemLocalLinha {
  cartaId: string;
  idioma: Idioma;
  arquivoNome: string;
  mimeType: string;
  tamanhoBytes: number;
  origem: OrigemImagemLocal;
  origemUrl: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export async function obterImagemLocal(
  db: Database,
  cartaId: string,
  idioma: Idioma,
): Promise<ImagemLocalLinha | null> {
  const linhas = await db
    .select()
    .from(imagemLocal)
    .where(and(eq(imagemLocal.cartaId, cartaId), eq(imagemLocal.idioma, idioma)))
    .limit(1);
  return linhas[0] ?? null;
}

export interface DadosImagemLocal {
  cartaId: string;
  idioma: Idioma;
  arquivoNome: string;
  mimeType: string;
  tamanhoBytes: number;
  origem: OrigemImagemLocal;
  origemUrl: string | null;
}

/**
 * Grava a imagem local, substituindo o registro anterior se já existir
 * (idempotência/substituição — item obrigatório da tarefa). Devolve o
 * `arquivoNome` anterior quando havia um registro (para o chamador
 * apagar o arquivo velho do disco — a troca de linha aqui não apaga
 * arquivo, só o metadado).
 */
export async function upsertImagemLocal(
  db: Database,
  dados: DadosImagemLocal,
): Promise<{ arquivoNomeAnterior: string | null }> {
  const existente = await obterImagemLocal(db, dados.cartaId, dados.idioma);

  await db
    .insert(imagemLocal)
    .values(dados)
    .onConflictDoUpdate({
      target: [imagemLocal.cartaId, imagemLocal.idioma],
      set: {
        arquivoNome: dados.arquivoNome,
        mimeType: dados.mimeType,
        tamanhoBytes: dados.tamanhoBytes,
        origem: dados.origem,
        origemUrl: dados.origemUrl,
        atualizadoEm: new Date(),
      },
    });

  return { arquivoNomeAnterior: existente?.arquivoNome ?? null };
}

/** Remove o registro e devolve o `arquivoNome` que ficou órfão no disco (o chamador apaga o arquivo). Idempotente: cartaId/idioma sem registro devolve `null`. */
export async function removerImagemLocal(
  db: Database,
  cartaId: string,
  idioma: Idioma,
): Promise<{ arquivoNome: string } | null> {
  const removidas = await db
    .delete(imagemLocal)
    .where(and(eq(imagemLocal.cartaId, cartaId), eq(imagemLocal.idioma, idioma)))
    .returning({ arquivoNome: imagemLocal.arquivoNome });
  return removidas[0] ?? null;
}
