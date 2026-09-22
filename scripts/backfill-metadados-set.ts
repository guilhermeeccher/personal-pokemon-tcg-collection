/**
 * `pnpm backfill:metadados-set` — preenche `set_sigla` e `set_lancamento`
 * em `carta_catalogo` a partir do que a TCGdex já expõe no objeto de SET
 * (`abbreviation.official`, `releaseDate`) e que o sync original não
 * capturava.
 *
 * Deliberadamente SEPARADO do sync completo: são dados de SET, não de
 * carta — não precisa (e não deve) repetir os ~35 mil requests de
 * `/cards/{id}`. Percorre só `/sets` + `/sets/{id}` por idioma (pt+en,
 * ~123+218 requests), a mesma primeira metade do sync normal.
 *
 * Só faz UPDATE em `carta_catalogo` (colunas novas, nullable — migration
 * 0003). Nunca toca `copia`, `colecao` ou `vaga`. Idempotente: rodar de
 * novo sobrescreve com o mesmo valor upstream, não duplica nada.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db, client } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";
import { mapComConcorrencia } from "../src/lib/sync/concorrencia";
import { listarSets, obterSet, type Idioma } from "../src/lib/sync/tcgdex";

const CONCORRENCIA_SETS = Number(process.env.SYNC_CONCORRENCIA_CATALOGO_SET) || 10;

const IDIOMAS: Idioma[] = ["pt", "en"];

interface ResultadoIdioma {
  idioma: Idioma;
  setsListados: number;
  setsComFalha: string[];
  setsComSigla: number;
  setsSemSigla: string[];
  linhasAtualizadas: number;
}

async function backfillIdioma(idioma: Idioma): Promise<ResultadoIdioma> {
  const setsBreves = await listarSets(idioma);
  const setsComFalha: string[] = [];
  const setsComSigla: string[] = [];
  const setsSemSigla: string[] = [];
  let linhasAtualizadas = 0;

  await mapComConcorrencia(setsBreves, CONCORRENCIA_SETS, async (setBreve) => {
    let setDetail;
    try {
      setDetail = await obterSet(idioma, setBreve.id);
    } catch (err) {
      setsComFalha.push(setBreve.id);
      console.error(`[backfill:${idioma}] failed to fetch set ${setBreve.id}:`, err);
      return;
    }

    const sigla = setDetail.abbreviation?.official ?? null;
    const lancamento = setDetail.releaseDate ?? null;
    if (sigla) setsComSigla.push(setBreve.id);
    else setsSemSigla.push(setBreve.id);

    // UPDATE, não INSERT: só toca linhas que já existem (o sync completo
    // é quem cria carta_catalogo). Sets sem nenhuma carta sincronizada
    // nesse idioma (ex.: os 33 sem carta a carta em pt) afetam 0 linhas —
    // não é erro, é o esperado.
    const resultado = await db
      .update(cartaCatalogo)
      .set({ setSigla: sigla, setLancamento: lancamento })
      .where(and(eq(cartaCatalogo.setId, setDetail.id), eq(cartaCatalogo.idioma, idioma)))
      .returning({ id: cartaCatalogo.id });
    linhasAtualizadas += resultado.length;
  });

  return {
    idioma,
    setsListados: setsBreves.length,
    setsComFalha,
    setsComSigla: setsComSigla.length,
    setsSemSigla,
    linhasAtualizadas,
  };
}

async function main() {
  const inicio = Date.now();
  let houveErroFatal = false;

  for (const idioma of IDIOMAS) {
    console.log(`\n=== backfill:${idioma} — start ===`);
    try {
      const r = await backfillIdioma(idioma);
      console.log(`[backfill:${idioma}] sets listed: ${r.setsListados}`);
      console.log(`[backfill:${idioma}] sets that failed to fetch: ${r.setsComFalha.length}`);
      if (r.setsComFalha.length > 0) {
        console.log(`[backfill:${idioma}]   -> ${r.setsComFalha.join(", ")}`);
      }
      console.log(`[backfill:${idioma}] sets with an abbreviation upstream: ${r.setsComSigla}`);
      console.log(`[backfill:${idioma}] sets WITHOUT an abbreviation upstream: ${r.setsSemSigla.length}`);
      if (r.setsSemSigla.length > 0) {
        console.log(`[backfill:${idioma}]   -> ${r.setsSemSigla.join(", ")}`);
      }
      console.log(`[backfill:${idioma}] carta_catalogo rows updated: ${r.linhasAtualizadas}`);
    } catch (err) {
      houveErroFatal = true;
      console.error(`[backfill:${idioma}] fatal failure:`, err);
    }
  }

  console.log(`\nbackfill:metadados-set ${houveErroFatal ? "finished with failures" : "completed"} in ${((Date.now() - inicio) / 1000).toFixed(1)}s.`);
  process.exitCode = houveErroFatal ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Unexpected error in the backfill:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
