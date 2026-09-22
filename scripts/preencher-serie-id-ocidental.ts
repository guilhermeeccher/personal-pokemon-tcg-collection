/**
 * `pnpm preencher:serie-id-ocidental` — preenche `carta_catalogo.set_serie_id`
 * nas linhas `pt` e `en`, lendo o id da série do mesmo clone local do
 * repositório de dados da TCGdex que o importador japonês usa
 * (`scripts/importar-catalogo-repo.ts`). **Nenhuma requisição à API.**
 *
 * Por que existe: a coluna `set_serie_id` nasceu junto com o catálogo
 * japonês e só ele a preenche. Enquanto ela é nula em pt/en, duas coisas
 * ficam quebradas:
 *
 *  1. O fallback de imagem (`imagemComFallbackCdn` em `lib/db/consultas.ts`)
 *     não tem como montar URL — e há 59 cartas em `en` cujo arquivo existe
 *     no CDN mesmo com `imagem_url` nulo.
 *  2. O seletor de expansão continua agrupando série pelo **nome**, que vem
 *     traduzido conforme a linha disponível: "Espada e Escudo" (24 sets) e
 *     "Sword & Shield" (2) aparecem como grupos separados.
 *
 * Esperar a API voltar para preencher uma coluna cujo valor está num
 * repositório público não faz sentido.
 *
 * **Escopo deliberadamente mínimo: este script só escreve `set_serie_id`.**
 * Não toca em nome, raridade, imagem, nem em nada mais das linhas
 * ocidentais — esses campos vieram da API e continuam sendo dela. Não
 * insere nem remove linha nenhuma. Só preenche onde está nulo, o que o
 * torna idempotente e seguro de repetir.
 *
 * Uso:
 *   docker compose exec -T app pnpm preencher:serie-id-ocidental
 *   docker compose exec -T app pnpm preencher:serie-id-ocidental --dry-run
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";

const REPO_PATH = process.env.TCGDEX_REPO_PATH ?? "/upstream-dados-tcgdex";
const PASTA_DADOS = path.join(REPO_PATH, "data");
const DRY_RUN = process.argv.includes("--dry-run");

/** Idiomas ocidentais. `jp` fica de fora: já vem preenchido do importador,
 *  e os ids de série japoneses diferem em caixa (`SM` vs `sm`). */
const IDIOMAS_ALVO = ["pt", "en"] as const;

async function importarModulo(caminho: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(caminho).href)) as { default: unknown };
  return mod.default;
}

function ehObjetoComId(v: unknown): v is { id?: unknown } {
  return typeof v === "object" && v !== null;
}

/** Lê `data/<Serie>.ts` + `data/<Serie>/<Set>.ts` e devolve setId → serieId. */
async function mapearSetParaSerie(): Promise<{
  mapa: Map<string, string>;
  seriesLidas: number;
  erros: { arquivo: string; erro: string }[];
}> {
  const mapa = new Map<string, string>();
  const erros: { arquivo: string; erro: string }[] = [];
  let seriesLidas = 0;

  const entradas = fs.readdirSync(PASTA_DADOS, { withFileTypes: true });
  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;

    const arquivoSerie = path.join(PASTA_DADOS, `${entrada.name}.ts`);
    if (!fs.existsSync(arquivoSerie)) continue;

    let serieId: string;
    try {
      const serie = await importarModulo(arquivoSerie);
      if (!ehObjetoComId(serie) || typeof serie.id !== "string") {
        throw new Error("series with no id");
      }
      serieId = serie.id;
      seriesLidas++;
    } catch (err) {
      erros.push({ arquivo: arquivoSerie, erro: String(err) });
      continue;
    }

    const pastaSerie = path.join(PASTA_DADOS, entrada.name);
    for (const arquivo of fs.readdirSync(pastaSerie)) {
      if (!arquivo.endsWith(".ts")) continue;
      const caminhoSet = path.join(pastaSerie, arquivo);
      try {
        const set = await importarModulo(caminhoSet);
        if (!ehObjetoComId(set) || typeof set.id !== "string") continue;
        mapa.set(set.id, serieId);
      } catch (err) {
        erros.push({ arquivo: caminhoSet, erro: String(err) });
      }
    }
  }

  return { mapa, seriesLidas, erros };
}

async function main() {
  if (!fs.existsSync(PASTA_DADOS)) {
    console.error(
      `Repository clone not found at ${PASTA_DADOS}. ` +
        `See the header of scripts/importar-catalogo-repo.ts.`,
    );
    process.exitCode = 1;
    return;
  }

  const { mapa, seriesLidas, erros } = await mapearSetParaSerie();
  console.log(`series read: ${seriesLidas} | sets mapped: ${mapa.size}`);
  if (erros.length > 0) {
    console.log(`files that failed to read: ${erros.length}`);
    for (const e of erros.slice(0, 5)) console.log(`  ${e.arquivo}: ${e.erro}`);
  }

  // Sets que temos no catálogo ocidental e ainda estão sem id de série.
  const pendentes = await db
    .selectDistinct({ setId: cartaCatalogo.setId })
    .from(cartaCatalogo)
    .where(
      and(
        inArray(cartaCatalogo.idioma, [...IDIOMAS_ALVO]),
        isNull(cartaCatalogo.setSerieId),
      ),
    );

  const semMapeamento: string[] = [];
  let setsAtualizados = 0;
  let linhasAtualizadas = 0;

  for (const { setId } of pendentes) {
    const serieId = mapa.get(setId);
    if (!serieId) {
      // Nunca inventa: set que o repositório não conhece fica nulo, e o
      // fallback de imagem simplesmente não age nele.
      semMapeamento.push(setId);
      continue;
    }
    if (DRY_RUN) {
      setsAtualizados++;
      continue;
    }
    const atualizadas = await db
      .update(cartaCatalogo)
      .set({ setSerieId: serieId })
      .where(
        and(
          eq(cartaCatalogo.setId, setId),
          inArray(cartaCatalogo.idioma, [...IDIOMAS_ALVO]),
          isNull(cartaCatalogo.setSerieId),
        ),
      )
      .returning({ id: cartaCatalogo.id });
    setsAtualizados++;
    linhasAtualizadas += atualizadas.length;
  }

  console.log(
    DRY_RUN
      ? `[dry-run] sets that would be filled: ${setsAtualizados}`
      : `sets filled: ${setsAtualizados} | rows updated: ${linhasAtualizadas}`,
  );
  if (semMapeamento.length > 0) {
    console.log(
      `sets with no series in the repository (left null): ${semMapeamento.length}`,
    );
    console.log(`  ${semMapeamento.slice(0, 15).join(", ")}`);
  }

  const restantes = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cartaCatalogo)
    .where(
      and(
        inArray(cartaCatalogo.idioma, [...IDIOMAS_ALVO]),
        isNull(cartaCatalogo.setSerieId),
      ),
    );
  console.log(`pt/en rows still without set_serie_id: ${restantes[0].n}`);
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
