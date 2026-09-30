/**
 * `pnpm importar:catalogo-repo` — popula `carta_catalogo` a partir de um
 * clone local do repositório de dados da TCGdex
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
 * Dois modos, escolhidos pelo idioma:
 *
 *  - **`jp` (padrão, `data-asia/`)** — o catálogo japonês inteiro vem
 *    daqui, e o importador faz upsert.
 *  - **`--idioma pt` ou `--idioma en` (`data/`) — só preenche lacuna
 *    (2026-09-30).** O catálogo ocidental é da API; o repositório só sai na
 *    frente dela (o 30th Celebration estava traduzido para pt no
 *    repositório com a API devolvendo 2 cartas). Neste modo a linha só é
 *    INSERIDA quando o (id, idioma) ainda não existe — nunca atualiza uma
 *    linha da API — e nasce com `origem = repo`, que a inativação do sync
 *    ignora; quando a API publicar a carta, o upsert dela a converte em
 *    `sync`. `--simular` lista o que entraria, por set, sem gravar.
 *
 * Contrato (mesmo do sync da API, `lib/sync/catalogo.ts`):
 *  - Idempotente — upsert (jp) ou insert-se-ausente (pt/en) por
 *    (id, idioma) via PK; rodar de novo não duplica nem altera a contagem
 *    de linhas.
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

const REPO_PATH = process.env.TCGDEX_REPO_PATH ?? "/upstream-dados-tcgdex";
const TAMANHO_LOTE_UPSERT = 500;

type IdiomaImportavel = "jp" | "pt" | "en";

/**
 * Onde cada idioma mora no repositório e como é gravado. A chave usada
 * dentro dos arquivos (`Languages<T>`) é o código ISO — `ja` para o nosso
 * `jp`, a mesma tradução que `codigoIdiomaUpstream` faz para a API, aqui
 * feita à mão porque não há cliente HTTP envolvido.
 */
const CONFIG_IDIOMA: Record<
  IdiomaImportavel,
  { pasta: string; codigoRepo: string; soLacunas: boolean }
> = {
  jp: { pasta: "data-asia", codigoRepo: "ja", soLacunas: false },
  pt: { pasta: "data", codigoRepo: "pt", soLacunas: true },
  en: { pasta: "data", codigoRepo: "en", soLacunas: true },
};

function lerArgumentos(argv: readonly string[]): {
  idioma: IdiomaImportavel;
  simular: boolean;
} {
  const i = argv.indexOf("--idioma");
  const valor = i === -1 ? "jp" : argv[i + 1];
  if (valor !== "jp" && valor !== "pt" && valor !== "en") {
    throw new Error(`--idioma must be jp, pt or en (got: ${String(valor)})`);
  }
  return { idioma: valor, simular: argv.includes("--simular") };
}

const ARGS = lerArgumentos(process.argv.slice(2));
const IDIOMA_BANCO = ARGS.idioma;
const { codigoRepo: CODIGO_IDIOMA_REPO, soLacunas: SO_LACUNAS } = CONFIG_IDIOMA[IDIOMA_BANCO];
const PASTA_DADOS = path.join(REPO_PATH, CONFIG_IDIOMA[IDIOMA_BANCO].pasta);

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
  /** Modo lacuna: cartas que já existiam no idioma e foram deixadas como estão. */
  cartasJaExistentes: number;
  /** Modo lacuna: quantas linhas novas cada set recebe. */
  lacunasPorSet: Map<string, number>;
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

/**
 * Modo lacuna: só insere. Uma linha que já existe no idioma — da API, do
 * seed ou de uma importação anterior — fica exatamente como está.
 */
async function inserirLacunas(linhas: LinhaCatalogo[]): Promise<void> {
  if (linhas.length === 0) return;
  await db
    .insert(cartaCatalogo)
    .values(linhas.map((l) => ({ ...l, origem: "repo" as const })))
    .onConflictDoNothing({ target: [cartaCatalogo.id, cartaCatalogo.idioma] });
}

async function gravarLote(linhas: LinhaCatalogo[]): Promise<void> {
  if (ARGS.simular) return;
  if (SO_LACUNAS) await inserirLacunas(linhas);
  else await upsertLoteCatalogo(linhas);
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
    cartasJaExistentes: 0,
    lacunasPorSet: new Map(),
    duracaoMs: 0,
  };

  if (!fs.existsSync(PASTA_DADOS)) {
    throw new Error(
      `Data folder not found: ${PASTA_DADOS}. Clone ` +
        `https://github.com/tcgdex/cards-database.git and point ` +
        `TCGDEX_REPO_PATH (or mount it at /upstream-dados-tcgdex, see ` +
        `compose.yaml) at the root of the clone.`,
    );
  }

  // Modo lacuna: o que o idioma já tem, para pular sem gravar e contar o
  // que entra por set. Uma consulta só — o idioma inteiro cabe folgado.
  const idsExistentes = new Set<string>();
  if (SO_LACUNAS) {
    const existentes = await db
      .select({ id: cartaCatalogo.id })
      .from(cartaCatalogo)
      .where(sql`${cartaCatalogo.idioma} = ${IDIOMA_BANCO}`);
    for (const e of existentes) idsExistentes.add(e.id);
  }

  const seriesDirs = fs
    .readdirSync(PASTA_DADOS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  let linhasPendentes: LinhaCatalogo[] = [];

  for (const serieDir of seriesDirs) {
    const serieDirPath = path.join(PASTA_DADOS, serieDir);
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
      // Pocket. Não visto em data-asia; em `data/` ele existe.
      if (set.serie.id === SERIE_EXCLUIDA_ID) {
        resultado.setsSerieExcluida++;
        continue;
      }

      if (!setDisponivelNoIdioma(set, CODIGO_IDIOMA_REPO)) {
        resultado.setsSemNomeNoIdioma++;
        continue;
      }

      resultado.setsQualificados++;

      // Em `data-asia` a pasta de cartas é nomeada pelo `id` embutido no set
      // (campo `set.id`), não pelo nome do arquivo — achado real: alguns
      // arquivos de set têm `id` diferente do próprio nome (ex.: `CS4.5.ts`
      // declara `id: 'CS4'`). Em `data/` é o contrário: a pasta tem o nome
      // do arquivo (`30th Celebration/`, id `30th`). Tenta o nome do arquivo
      // e depois o id, replicando o fallback de `getCards` no compilador da
      // TCGdex.
      const cardDirPath =
        [setFileId, set.id]
          .map((nome) => path.join(serieDirPath, nome))
          .find((caminho) => fs.existsSync(caminho)) ?? path.join(serieDirPath, set.id);
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
          `${set.id} (${serieDir}/${setFileId}, folder had files but none with a name in ${CODIGO_IDIOMA_REPO})`,
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
        if (SO_LACUNAS) {
          if (idsExistentes.has(linha.id)) {
            resultado.cartasJaExistentes++;
            continue;
          }
          resultado.lacunasPorSet.set(set.id, (resultado.lacunasPorSet.get(set.id) ?? 0) + 1);
        }
        linhasPendentes.push(linha);
        if (cartaDetalhada.dexId?.length === 1) {
          resultado.cartasComDexIdUnico++;
        }
      }

      if (linhasPendentes.length >= TAMANHO_LOTE_UPSERT) {
        for (const lote of emLotes(linhasPendentes, TAMANHO_LOTE_UPSERT)) {
          await gravarLote(lote);
        }
        resultado.cartasUpsertadas += linhasPendentes.length;
        linhasPendentes = [];
      }
    }
  }

  if (linhasPendentes.length > 0) {
    for (const lote of emLotes(linhasPendentes, TAMANHO_LOTE_UPSERT)) {
      await gravarLote(lote);
    }
    resultado.cartasUpsertadas += linhasPendentes.length;
  }

  resultado.duracaoMs = Date.now() - inicio;
  return resultado;
}

async function main() {
  console.log(
    `importar:catalogo-repo — idioma=${IDIOMA_BANCO}, reading from ${PASTA_DADOS}` +
      (SO_LACUNAS ? " (gap-fill: inserts missing rows only, origem=repo)" : "") +
      (ARGS.simular ? " — DRY RUN, nothing is written" : ""),
  );
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
  if (SO_LACUNAS) {
    console.log(`cards already in carta_catalogo (left untouched): ${r.cartasJaExistentes}`);
    console.log(
      `cards ${ARGS.simular ? "that would be inserted" : "inserted"} (idioma=${IDIOMA_BANCO}, origem=repo): ${r.cartasUpsertadas}`,
    );
    const porSet = [...r.lacunasPorSet].sort((a, b) => b[1] - a[1]);
    for (const [setId, qtd] of porSet) console.log(`  -> ${setId}: ${qtd}`);
  } else {
    console.log(`cards upserted into carta_catalogo (idioma=${IDIOMA_BANCO}): ${r.cartasUpsertadas}`);
  }
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
