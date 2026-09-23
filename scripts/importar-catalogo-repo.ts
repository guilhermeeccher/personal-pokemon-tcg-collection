/**
 * `pnpm importar:catalogo-repo` — popula `carta_catalogo` com o idioma `jp`
 * a partir de um clone local do repositório de dados da TCGdex
 * (https://github.com/tcgdex/cards-database, MIT), sem NENHUMA requisição a
 * api.tcgdex.net. Existe porque o IP deste servidor está bloqueado no
 * firewall da TCGdex desde 2026-08-25 (AGENTS.md) e existem cartas
 * japonesas de sets sem equivalente ocidental (ex.: SM3H-009).
 *
 * Pré-requisito (fora deste script, roda uma vez só, fora do projeto):
 *   git clone --depth 1 https://github.com/tcgdex/cards-database.git \
 *     .dados/tcgdex-cards-database
 * O compose.yaml monta esse clone (só-leitura) em /upstream-dados-tcgdex
 * dentro do container `app`. Rode este script com:
 *   docker compose exec -T app pnpm importar:catalogo-repo
 * Ou, fora do container, aponte TCGDEX_REPO_PATH para o clone local.
 *
 * O repositório é grande (~220 MB) e não-trivial de atualizar — não é
 * "puxado" automaticamente por este script. Rode `git -C <clone> pull`
 * manualmente quando quiser dados mais recentes.
 *
 * Contrato (mesmo do sync da API, `lib/sync/catalogo.ts`):
 *  - Idempotente — upsert por (id, idioma) via PK, rodar de novo não
 *    duplica nem altera a contagem de linhas.
 *  - Nunca troca o que já sabemos pelo vazio do upstream: número de
 *    Pokédex derivado, imagem e `ativa` sobrevivem à reimportação (ver o
 *    `set` do upsert, abaixo).
 *  - Nunca apaga e nunca marca `ativa = false` — este importador só
 *    escreve, nunca inativa. Diferente do sync da API, não há aqui uma
 *    noção de "sumiu do upstream": o clone é uma foto estática, e decidir
 *    que uma carta "sumiu" exigiria confiar que o clone está 100%
 *    atualizado, o que não temos como garantir.
 *  - Nunca sincroniza a série `tcgp` (Pokémon TCG Pocket) — o filtro é
 *    mantido por segurança, embora ela não exista em `data-asia` (checado
 *    em 2026-08-26).
 *  - Nunca toca `copia`, `colecao` ou `vaga`.
 *  - `imagem_url` fica sempre `null` — o repositório não traz esse campo
 *    (outra frente cuida do fallback de imagem).
 *
 * A conversão do dado bruto do repositório para o formato de
 * `carta_catalogo` vive em `lib/dominio/parser-catalogo-repo.ts` (módulo
 * puro, testado com dados reais). Este script só faz I/O: acha os
 * arquivos, importa via `tsx` (mesmo runtime que executa este script —
 * suporta `import()` dinâmico de `.ts` arbitrário, dentro ou fora do
 * projeto) e grava em lote.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";

import {
  cartaDisponivelNoIdioma,
  converterCartaRepoParaDetalhada,
  converterSetRepoParaDetalhado,
  setDisponivelNoIdioma,
  type RepoCartaBruta,
  type RepoSetBruto,
} from "../src/lib/dominio/parser-catalogo-repo";
import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";
import { paraLinha, SERIE_EXCLUIDA_ID } from "../src/lib/sync/catalogo";

/** Enum do nosso banco. A chave usada dentro dos arquivos do repositório
 * (`Languages<T>`) é o código ISO `ja` — a mesma tradução que
 * `codigoIdiomaUpstream` faz para a API, aqui feita à mão porque não há
 * cliente HTTP envolvido. */
const IDIOMA_BANCO = "jp" as const;
const CODIGO_IDIOMA_REPO = "ja";

const REPO_PATH = process.env.TCGDEX_REPO_PATH ?? "/upstream-dados-tcgdex";
const PASTA_DADOS_ASIA = path.join(REPO_PATH, "data-asia");
const TAMANHO_LOTE_UPSERT = 500;

type LinhaCatalogo = ReturnType<typeof paraLinha> & { setSerieId: string };

interface ResultadoImportacao {
  setsEncontrados: number;
  setsSerieExcluida: number;
  setsSemNomeNoIdioma: number;
  setsQualificados: number;
  setsSemCartas: string[];
  setsComErro: { set: string; erro: string }[];
  cartasEncontradas: number;
  cartasSemNomeNoIdioma: number;
  cartasComErro: { arquivo: string; erro: string }[];
  cartasUpsertadas: number;
  cartasComDexIdUnico: number;
  duracaoMs: number;
}

async function importarModulo(caminhoAbsoluto: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(caminhoAbsoluto).href)) as {
    default: unknown;
  };
  return mod.default;
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Upsert por (id, idioma), igual a `upsertLote` em `lib/sync/catalogo.ts`,
 * só que também grava `setSerieId` — coluna que o sync da API ainda não
 * preenche (fica para quando o acesso à API voltar). Não reaproveita
 * `upsertLote` diretamente por isso: ela não conhece essa coluna.
 */
async function upsertLoteCatalogo(linhas: LinhaCatalogo[]): Promise<void> {
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
        // Número conhecido NUNCA é apagado por um upstream que veio vazio —
        // a mesma guarda do sync da API (`lib/sync/catalogo.ts`). O
        // repositório publica sem `dexId` boa parte das ex/Mega japonesas, e
        // `pnpm derivar:dex-ids` preenche essas por dedução do nome. Sem esta
        // guarda, cada reimportação desfazia a dedução em silêncio: foi o que
        // aconteceu em 2026-09-22, com 433 cartas, e só foi visto porque o
        // seed regenerado foi comparado linha a linha com o anterior. Quando
        // o upstream PASSA a trazer o número, ele vence.
        dexIds: sql`case
          when cardinality(excluded.dex_ids) > 0 then excluded.dex_ids
          else ${cartaCatalogo.dexIds}
        end`,
        // A marca de dedução acompanha o número: antes, este upsert nem
        // tocava nela, e a linha ficava marcada como deduzida com o número
        // vazio.
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
        // O repositório não traz imagem: o que chega aqui é sempre `null`.
        // Gravar isso por cima apagaria a imagem que a linha tiver ganhado de
        // outra fonte (o sync da API traz URL de imagem para o japonês).
        imagemUrl: sql`coalesce(excluded.imagem_url, ${cartaCatalogo.imagemUrl})`,
        ilustrador: sql`excluded.ilustrador`,
        setQtdOficial: sql`excluded.set_qtd_oficial`,
        setQtdTotal: sql`excluded.set_qtd_total`,
        atualizadoEm: sql`excluded.atualizado_em`,
        // `ativa` fica fora do UPDATE de propósito, pela mesma regra do seed:
        // carta que o sync desativou continua desativada. Este importador
        // não sabe decidir que uma carta sumiu — e, pelo mesmo motivo, não
        // tem como saber que ela voltou.
      },
    });
}

async function importar(): Promise<ResultadoImportacao> {
  const inicio = Date.now();
  const resultado: ResultadoImportacao = {
    setsEncontrados: 0,
    setsSerieExcluida: 0,
    setsSemNomeNoIdioma: 0,
    setsQualificados: 0,
    setsSemCartas: [],
    setsComErro: [],
    cartasEncontradas: 0,
    cartasSemNomeNoIdioma: 0,
    cartasComErro: [],
    cartasUpsertadas: 0,
    cartasComDexIdUnico: 0,
    duracaoMs: 0,
  };

  if (!fs.existsSync(PASTA_DADOS_ASIA)) {
    throw new Error(
      `Data folder not found: ${PASTA_DADOS_ASIA}. Clone ` +
        `https://github.com/tcgdex/cards-database.git and point ` +
        `TCGDEX_REPO_PATH (or mount it at /upstream-dados-tcgdex, see ` +
        `compose.yaml) at the root of the clone.`,
    );
  }

  const seriesDirs = fs
    .readdirSync(PASTA_DADOS_ASIA, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  let linhasPendentes: LinhaCatalogo[] = [];

  for (const serieDir of seriesDirs) {
    const serieDirPath = path.join(PASTA_DADOS_ASIA, serieDir);
    const setFiles = fs
      .readdirSync(serieDirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"));

    for (const setFile of setFiles) {
      resultado.setsEncontrados++;
      const setFileId = setFile.name.replace(/\.ts$/, "");
      const setPath = path.join(serieDirPath, setFile.name);

      let set: RepoSetBruto;
      try {
        set = (await importarModulo(setPath)) as RepoSetBruto;
      } catch (err) {
        resultado.setsComErro.push({
          set: `${serieDir}/${setFileId}`,
          erro: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // Filtro do contrato do sync (AGENTS.md): nunca sincroniza TCG
      // Pocket. Não visto em data-asia, mantido por segurança.
      if (set.serie.id === SERIE_EXCLUIDA_ID) {
        resultado.setsSerieExcluida++;
        continue;
      }

      if (!setDisponivelNoIdioma(set, CODIGO_IDIOMA_REPO)) {
        resultado.setsSemNomeNoIdioma++;
        continue;
      }

      resultado.setsQualificados++;

      // Usa o `id` embutido no set (campo `set.id`), não o nome do
      // arquivo — achado real: alguns arquivos de set do repositório têm
      // `id` diferente do próprio nome do arquivo (ex.: `CS4.5.ts` declara
      // `id: 'CS4'`). A pasta de cartas correspondente é sempre nomeada
      // pelo `id`, replicando o fallback de `getCards` no compilador da
      // TCGdex.
      const cardDirPath = path.join(serieDirPath, set.id);
      if (!fs.existsSync(cardDirPath)) {
        resultado.setsSemCartas.push(`${set.id} (${serieDir}/${setFileId})`);
        continue;
      }
      const cardFiles = fs
        .readdirSync(cardDirPath)
        .filter((f) => f.endsWith(".ts"));
      if (cardFiles.length === 0) {
        resultado.setsSemCartas.push(`${set.id} (${serieDir}/${setFileId})`);
        continue;
      }

      // Primeiro passo: carrega e filtra todas as cartas do set, para
      // conhecer a contagem no idioma ANTES de montar o SetDetalhado —
      // `cardCount.total` depende dela (Math.max(official, contagem)).
      const cartasDoSet: { localId: string; carta: RepoCartaBruta }[] = [];
      for (const cf of cardFiles) {
        resultado.cartasEncontradas++;
        const cardPath = path.join(cardDirPath, cf);
        let carta: RepoCartaBruta;
        try {
          carta = (await importarModulo(cardPath)) as RepoCartaBruta;
        } catch (err) {
          resultado.cartasComErro.push({
            arquivo: cardPath,
            erro: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
        if (!cartaDisponivelNoIdioma(carta, CODIGO_IDIOMA_REPO)) {
          resultado.cartasSemNomeNoIdioma++;
          continue;
        }
        const localId = cf.replace(/\.ts$/, "");
        cartasDoSet.push({ localId, carta });
      }

      if (cartasDoSet.length === 0) {
        resultado.setsSemCartas.push(
          `${set.id} (${serieDir}/${setFileId}, folder had files but none with a name in ja)`,
        );
        continue;
      }

      const setDetalhado = converterSetRepoParaDetalhado(
        set,
        CODIGO_IDIOMA_REPO,
        cartasDoSet.length,
      );

      for (const { localId, carta } of cartasDoSet) {
        const cartaDetalhada = converterCartaRepoParaDetalhada(
          set.id,
          localId,
          carta,
          CODIGO_IDIOMA_REPO,
        );
        const linha: LinhaCatalogo = {
          ...paraLinha(IDIOMA_BANCO, setDetalhado, cartaDetalhada),
          setSerieId: set.serie.id,
        };
        linhasPendentes.push(linha);
        if (cartaDetalhada.dexId?.length === 1) {
          resultado.cartasComDexIdUnico++;
        }
      }

      if (linhasPendentes.length >= TAMANHO_LOTE_UPSERT) {
        for (const lote of emLotes(linhasPendentes, TAMANHO_LOTE_UPSERT)) {
          await upsertLoteCatalogo(lote);
        }
        resultado.cartasUpsertadas += linhasPendentes.length;
        linhasPendentes = [];
      }
    }
  }

  if (linhasPendentes.length > 0) {
    for (const lote of emLotes(linhasPendentes, TAMANHO_LOTE_UPSERT)) {
      await upsertLoteCatalogo(lote);
    }
    resultado.cartasUpsertadas += linhasPendentes.length;
  }

  resultado.duracaoMs = Date.now() - inicio;
  return resultado;
}

async function main() {
  console.log(`importar:catalogo-repo — reading from ${PASTA_DADOS_ASIA}`);
  const r = await importar();
  console.log(`\nsets found (.ts): ${r.setsEncontrados}`);
  console.log(`sets skipped (excluded series '${SERIE_EXCLUIDA_ID}'): ${r.setsSerieExcluida}`);
  console.log(`sets with no name in '${CODIGO_IDIOMA_REPO}' (set or series): ${r.setsSemNomeNoIdioma}`);
  console.log(`sets qualified for ${IDIOMA_BANCO}: ${r.setsQualificados}`);
  console.log(`sets qualified but with no importable card: ${r.setsSemCartas.length}`);
  if (r.setsSemCartas.length > 0) {
    console.log(`  -> ${r.setsSemCartas.join(", ")}`);
  }
  if (r.setsComErro.length > 0) {
    console.log(`sets that errored while importing the module: ${r.setsComErro.length}`);
    for (const e of r.setsComErro) console.log(`  -> ${e.set}: ${e.erro}`);
  }
  console.log(`\ncard files found (in the qualified sets): ${r.cartasEncontradas}`);
  console.log(`cards with no name in '${CODIGO_IDIOMA_REPO}' (excluded): ${r.cartasSemNomeNoIdioma}`);
  if (r.cartasComErro.length > 0) {
    console.log(`cards that errored while importing the module: ${r.cartasComErro.length}`);
    for (const e of r.cartasComErro) console.log(`  -> ${e.arquivo}: ${e.erro}`);
  }
  console.log(`cards upserted into carta_catalogo (idioma=${IDIOMA_BANCO}): ${r.cartasUpsertadas}`);
  console.log(`  of those, with a unique dexId (eligible for a Pokédex slot): ${r.cartasComDexIdUnico}`);
  console.log(`duration: ${(r.duracaoMs / 1000).toFixed(1)}s`);

  process.exitCode = r.setsComErro.length > 0 || r.cartasComErro.length > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Unexpected error in the importer:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
