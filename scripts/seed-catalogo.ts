/**
 * `pnpm seed:catalogo` — popula `carta_catalogo` e `set_mypcards` a partir
 * dos arquivos versionados em `seed/`, sem NENHUMA requisição de rede.
 *
 * É o que faz uma instalação nova nascer útil: sem isto, quem clona o
 * projeto sobe com banco vazio e precisaria rodar horas de sync contra a
 * api.tcgdex.net (que já bloqueou o IP deste projeto uma vez, ver
 * AGENTS.md) ou baixar o clone de ~220 MB do repositório de dados deles.
 *
 * Uso:
 *   pnpm seed:catalogo              # carrega sempre
 *   pnpm seed:catalogo --se-vazio   # carrega só se carta_catalogo estiver vazia
 *
 * `--se-vazio` é o modo do primeiro boot (`docker/entrypoint.sh`): numa
 * instalação que já tem catálogo — sincronizado, corrigido à mão, com
 * linhas `origem = manual` — reescrever tudo a cada subida do container
 * seria o oposto do que se espera de um seed.
 *
 * ## Contrato (o mesmo do sync de catálogo, AGENTS.md)
 *
 *  - **Idempotente.** Upsert por (`id`, `idioma`) — a PK da tabela. Rodar
 *    duas vezes não duplica linha nem altera a contagem.
 *  - **Nunca apaga, nunca inativa.** O seed é uma foto estática: não existe
 *    aqui a noção de "sumiu do upstream", que exigiria confiar que o
 *    arquivo está 100% atualizado. Por isso `ativa` é gravada no INSERT mas
 *    fica **de fora do UPDATE** do upsert: numa instalação existente, carta
 *    que o sync marcou inativa continua inativa, e o seed nunca inativa
 *    nada por conta própria. `origem` fica de fora pelo mesmo motivo
 *    invertido: linha que o usuário criou à mão (`manual`) jamais é
 *    rebaixada para `sync`, o que a exporia à inativação pelo sync.
 *  - **Nunca bloqueia o uso.** Falha registra erro e devolve exit code 1; o
 *    entrypoint segue subindo o servidor, e a app funciona com o catálogo
 *    que houver (inclusive nenhum).
 *  - **Zero rede.** Só lê arquivo local e escreve no banco.
 *  - **Nunca toca `copia`, `colecao`, `vaga` ou qualquer dado de coleção.**
 *
 * ## Como regerar os arquivos de `seed/`
 *
 * O procedimento completo, com o comando de exportação, está em
 * `seed/README.md`. Em resumo: um `COPY ... TO STDOUT WITH (FORMAT csv,
 * HEADER)` de `carta_catalogo` e de `set_mypcards` num banco já
 * sincronizado, o primeiro comprimido com `gzip -9 -n`.
 *
 * O formato dos arquivos e a conversão para linha de banco vivem em
 * `lib/dominio/seed-catalogo.ts` (módulo puro, testado). Este script só faz
 * I/O: descomprime, chama o conversor e grava em lote.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo, setMypcards } from "../src/lib/db/schema";
import {
  COLUNAS_CATALOGO,
  COLUNAS_SET_MYPCARDS,
  converterLinhaCatalogo,
  converterLinhaSetMypcards,
  lerRegistrosCsv,
  type LinhaSeedCatalogo,
  type LinhaSeedSetMypcards,
} from "../src/lib/dominio/seed-catalogo";

/** Relativo ao diretório de trabalho, como `scripts/migrate.mjs` faz com
 * `./drizzle`: os dois rodam da raiz do projeto (`WORKDIR /app` no
 * container, raiz do repositório no `pnpm`). */
const PASTA_SEED = path.resolve(process.cwd(), "seed");
const ARQUIVO_CATALOGO = path.join(PASTA_SEED, "carta-catalogo.csv.gz");
const ARQUIVO_SET_MYPCARDS = path.join(PASTA_SEED, "set-mypcards.csv");

/** 500 linhas × 29 colunas = 14.500 parâmetros por statement, bem abaixo do
 * teto de 65.535 do protocolo do Postgres. Mesmo lote do sync. */
const TAMANHO_LOTE_UPSERT = 500;

interface ResultadoSeed {
  cartasNoArquivo: number;
  cartasUpsertadas: number;
  setsMypcardsUpsertados: number;
  duracaoMs: number;
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

function lerCsvComprimido(caminho: string): string {
  if (!fs.existsSync(caminho)) {
    throw new Error(
      `Arquivo de seed não encontrado: ${caminho}. Ele é versionado no ` +
        `repositório — rode o script a partir da raiz do projeto.`,
    );
  }
  return zlib.gunzipSync(fs.readFileSync(caminho)).toString("utf8");
}

function lerCsv(caminho: string): string {
  if (!fs.existsSync(caminho)) {
    throw new Error(
      `Arquivo de seed não encontrado: ${caminho}. Ele é versionado no ` +
        `repositório — rode o script a partir da raiz do projeto.`,
    );
  }
  return fs.readFileSync(caminho, "utf8");
}

async function catalogoEstaVazio(): Promise<boolean> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cartaCatalogo);
  return (linha?.total ?? 0) === 0;
}

/**
 * Upsert por (id, idioma). `ativa` e `origem` entram no INSERT mas não no
 * UPDATE — ver o contrato no cabeçalho. `criado_em` nunca é tocado; o
 * `atualizado_em` é renovado porque a linha acabou de ser conferida contra
 * o arquivo.
 */
async function upsertLoteCatalogo(
  linhas: LinhaSeedCatalogo[],
  agora: Date,
): Promise<void> {
  if (linhas.length === 0) return;
  await db
    .insert(cartaCatalogo)
    .values(linhas.map((linha) => ({ ...linha, atualizadoEm: agora })))
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
        dexIds: sql`excluded.dex_ids`,
        forma: sql`excluded.forma`,
        varianteNormalDisponivel: sql`excluded.variante_normal_disponivel`,
        varianteReverseDisponivel: sql`excluded.variante_reverse_disponivel`,
        varianteHoloDisponivel: sql`excluded.variante_holo_disponivel`,
        variantePrimeiraEdicaoDisponivel: sql`excluded.variante_primeira_edicao_disponivel`,
        variantePromoDisponivel: sql`excluded.variante_promo_disponivel`,
        tipos: sql`excluded.tipos`,
        dexIdsDerivado: sql`excluded.dex_ids_derivado`,
        imagemUrl: sql`excluded.imagem_url`,
        imagemCdnExiste: sql`excluded.imagem_cdn_existe`,
        imagemCdnVerificadoEm: sql`excluded.imagem_cdn_verificado_em`,
        ilustrador: sql`excluded.ilustrador`,
        setQtdOficial: sql`excluded.set_qtd_oficial`,
        setQtdTotal: sql`excluded.set_qtd_total`,
        atualizadoEm: sql`excluded.atualizado_em`,
      },
    });
}

/**
 * Upsert por `set_id`. Nunca remove mapeamento que o usuário tenha
 * descoberto por conta própria colando um link — só escreve os do arquivo.
 */
async function upsertSetMypcards(
  linhas: LinhaSeedSetMypcards[],
  agora: Date,
): Promise<void> {
  if (linhas.length === 0) return;
  await db
    .insert(setMypcards)
    .values(linhas.map((linha) => ({ ...linha, atualizadoEm: agora })))
    .onConflictDoUpdate({
      target: setMypcards.setId,
      set: {
        numero: sql`excluded.numero`,
        origemUrl: sql`excluded.origem_url`,
        atualizadoEm: sql`excluded.atualizado_em`,
      },
    });
}

async function semear(): Promise<ResultadoSeed> {
  const inicio = Date.now();
  const agora = new Date();

  const registrosCatalogo = lerRegistrosCsv(
    lerCsvComprimido(ARQUIVO_CATALOGO),
    COLUNAS_CATALOGO,
  );
  const linhasCatalogo = registrosCatalogo.map(converterLinhaCatalogo);

  let upsertadas = 0;
  const lotes = emLotes(linhasCatalogo, TAMANHO_LOTE_UPSERT);
  for (const [indice, lote] of lotes.entries()) {
    await upsertLoteCatalogo(lote, agora);
    upsertadas += lote.length;
    if ((indice + 1) % 20 === 0 || indice === lotes.length - 1) {
      console.log(`  ${upsertadas}/${linhasCatalogo.length} cartas`);
    }
  }

  const linhasSetMypcards = lerRegistrosCsv(
    lerCsv(ARQUIVO_SET_MYPCARDS),
    COLUNAS_SET_MYPCARDS,
  ).map(converterLinhaSetMypcards);
  for (const lote of emLotes(linhasSetMypcards, TAMANHO_LOTE_UPSERT)) {
    await upsertSetMypcards(lote, agora);
  }

  return {
    cartasNoArquivo: linhasCatalogo.length,
    cartasUpsertadas: upsertadas,
    setsMypcardsUpsertados: linhasSetMypcards.length,
    duracaoMs: Date.now() - inicio,
  };
}

async function main() {
  const soSeVazio = process.argv.includes("--se-vazio");

  if (soSeVazio && !(await catalogoEstaVazio())) {
    console.log(
      "seed:catalogo — carta_catalogo já tem cartas; nada a fazer " +
        "(--se-vazio). Para recarregar mesmo assim, rode sem a flag.",
    );
    return;
  }

  console.log(`seed:catalogo — lendo de ${PASTA_SEED}`);
  const r = await semear();
  console.log(`\ncartas no arquivo: ${r.cartasNoArquivo}`);
  console.log(`cartas upsertadas em carta_catalogo: ${r.cartasUpsertadas}`);
  console.log(`sets upsertados em set_mypcards: ${r.setsMypcardsUpsertados}`);
  console.log(`duração: ${(r.duracaoMs / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    // "Nunca bloqueia o uso": o erro é registrado e o exit code sinaliza a
    // falha, mas quem chama (entrypoint) segue subindo o servidor.
    console.error("Falha ao semear o catálogo:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
