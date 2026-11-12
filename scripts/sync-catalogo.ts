/**
 * `pnpm sync:catalogo` — sincroniza o catálogo TCGdex em pt, en e jp.
 * Nunca bloqueia o uso da app: roda como processo separado, fora do ciclo
 * de vida do servidor Next.js. Se falhar, registra erro e sai com código
 * de erro — a app continua servindo o último estado local normalmente.
 */
import "dotenv/config";

import { ErroBloqueioUpstream } from "../src/lib/dominio/bloqueio-upstream";
import {
  lerArgumentosSyncCatalogo,
  SAIDA_USO_SYNC,
  USO_SYNC_CATALOGO,
} from "../src/lib/dominio/comando-sync-catalogo";
import { client, db } from "../src/lib/db/client";
import { sincronizarCatalogo } from "../src/lib/sync/catalogo";

async function main() {
  // Lido antes de qualquer rede: argumento errado recusa a rodada inteira
  // (o porquê está em `lib/dominio/comando-sync-catalogo.ts`).
  const lidos = lerArgumentosSyncCatalogo(process.argv.slice(2));
  if (!lidos.ok) {
    console.error(`sync:catalogo: ${lidos.erro}\n\n${USO_SYNC_CATALOGO}`);
    process.exitCode = SAIDA_USO_SYNC;
    return;
  }
  if (lidos.args.ajuda) {
    console.log(USO_SYNC_CATALOGO);
    return;
  }

  // `jp` entrou em 2026-08-26: existem cartas japonesas de sets sem
  // equivalente ocidental. Na URL da TCGdex o código é `ja` — a tradução vive
  // em `codigoIdiomaUpstream`, o enum do banco continua `jp`.
  const { idiomas } = lidos.args;
  // `--profundo` (ou SYNC_PROFUNDO=1) revisita todo set carta a carta. O
  // padrão é incremental: só busca detalhe nos sets cuja lista de cartas mudou.
  const profundo = lidos.args.profundo || process.env.SYNC_PROFUNDO === "1";

  let houveErroFatal = false;

  console.log(`languages: ${idiomas.join(", ")}`);
  if (profundo) {
    console.log("deep mode: revisiting every set card by card.");
  }

  for (const idioma of idiomas) {
    console.log(`\n=== sync:${idioma} — start ===`);
    try {
      const resultado = await sincronizarCatalogo(db, idioma, {
        profundo,
      });
      console.log(`[sync:${idioma}] sets listed: ${resultado.setsListados}`);
      console.log(`[sync:${idioma}] sets that failed to fetch: ${resultado.setsComFalha.length}`);
      console.log(`[sync:${idioma}] sets skipped (TCG Pocket series): ${resultado.setsSeriePocketIgnorados.length}`);
      console.log(`[sync:${idioma}] sets with no cards (upstream): ${resultado.setsSemCartas.length}`);
      if (resultado.setsSemCartas.length > 0) {
        console.log(`[sync:${idioma}]   -> ${resultado.setsSemCartas.join(", ")}`);
      }
      console.log(`[sync:${idioma}] sets unchanged (skipped): ${resultado.setsInalterados.length}`);
      console.log(`[sync:${idioma}] cards revalidated with no request: ${resultado.cartasRevalidadas}`);
      console.log(`[sync:${idioma}] requests saved: ${resultado.requisicoesEconomizadas}`);
      console.log(`[sync:${idioma}] cards upserted: ${resultado.cartasUpsertadas}`);
      console.log(`[sync:${idioma}] cards with errors: ${resultado.cartasComErro.length}`);
      console.log(`[sync:${idioma}] marked inactive in this round: ${resultado.marcadasInativas}`);
      console.log(`[sync:${idioma}] duration: ${(resultado.duracaoMs / 1000).toFixed(1)}s`);
    } catch (err) {
      houveErroFatal = true;
      console.error(`[sync:${idioma}] fatal failure — sync for this language aborted:`, err);
      // Bloqueio de acesso não é problema de um idioma: é a porta fechada
      // para todos. Seguir para o próximo idioma só renovaria o bloqueio
      // (foi assim que perdemos o acesso em 2026-08-25).
      if (err instanceof ErroBloqueioUpstream) {
        console.error(
          "sync:catalogo interrupted — TCGdex blocked our access. " +
            "Do not run it again before the block is resolved.",
        );
        break;
      }
    }
  }

  console.log(houveErroFatal ? "\nsync:catalogo finished with failures." : "\nsync:catalogo completed.");
  process.exitCode = houveErroFatal ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Unexpected error in the sync:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Encerra a conexão do pool para o processo poder sair.
    await client.end();
  });
