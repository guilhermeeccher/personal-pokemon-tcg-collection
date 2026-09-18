/**
 * `pnpm sync:catalogo` — sincroniza o catálogo TCGdex em pt, en e jp.
 * Nunca bloqueia o uso da app: roda como processo separado, fora do ciclo
 * de vida do servidor Next.js. Se falhar, registra erro e sai com código
 * de erro — a app continua servindo o último estado local normalmente.
 */
import "dotenv/config";

import { ErroBloqueioUpstream } from "../src/lib/dominio/bloqueio-upstream";
import { client, db } from "../src/lib/db/client";
import { sincronizarCatalogo } from "../src/lib/sync/catalogo";
import type { Idioma } from "../src/lib/sync/tcgdex";

/**
 * `jp` entrou em 2026-08-26: existem cartas japonesas de sets sem
 * equivalente ocidental. Na URL da TCGdex o código é `ja` — a tradução vive
 * em `codigoIdiomaUpstream`, o enum do banco continua `jp`.
 */
const IDIOMAS: Idioma[] = ["pt", "en", "jp"];

/**
 * `--profundo` (ou SYNC_PROFUNDO=1) revisita todo set carta a carta. O padrão
 * é incremental: só busca detalhe nos sets cuja lista de cartas mudou.
 */
const PROFUNDO =
  process.argv.includes("--profundo") || process.env.SYNC_PROFUNDO === "1";

async function main() {
  let houveErroFatal = false;

  if (PROFUNDO) {
    console.log("modo profundo: revisitando todos os sets carta a carta.");
  }

  for (const idioma of IDIOMAS) {
    console.log(`\n=== sync:${idioma} — início ===`);
    try {
      const resultado = await sincronizarCatalogo(db, idioma, {
        profundo: PROFUNDO,
      });
      console.log(`[sync:${idioma}] sets listados: ${resultado.setsListados}`);
      console.log(`[sync:${idioma}] sets com falha ao buscar: ${resultado.setsComFalha.length}`);
      console.log(`[sync:${idioma}] sets ignorados (série TCG Pocket): ${resultado.setsSeriePocketIgnorados.length}`);
      console.log(`[sync:${idioma}] sets sem cartas (upstream): ${resultado.setsSemCartas.length}`);
      if (resultado.setsSemCartas.length > 0) {
        console.log(`[sync:${idioma}]   -> ${resultado.setsSemCartas.join(", ")}`);
      }
      console.log(`[sync:${idioma}] sets inalterados (pulados): ${resultado.setsInalterados.length}`);
      console.log(`[sync:${idioma}] cartas revalidadas sem requisição: ${resultado.cartasRevalidadas}`);
      console.log(`[sync:${idioma}] requisições economizadas: ${resultado.requisicoesEconomizadas}`);
      console.log(`[sync:${idioma}] cartas upsertadas: ${resultado.cartasUpsertadas}`);
      console.log(`[sync:${idioma}] cartas com erro: ${resultado.cartasComErro.length}`);
      console.log(`[sync:${idioma}] marcadas inativas nesta rodada: ${resultado.marcadasInativas}`);
      console.log(`[sync:${idioma}] duração: ${(resultado.duracaoMs / 1000).toFixed(1)}s`);
    } catch (err) {
      houveErroFatal = true;
      console.error(`[sync:${idioma}] falha fatal — sync deste idioma abortado:`, err);
      // Bloqueio de acesso não é problema de um idioma: é a porta fechada
      // para todos. Seguir para o próximo idioma só renovaria o bloqueio
      // (foi assim que perdemos o acesso em 2026-08-25).
      if (err instanceof ErroBloqueioUpstream) {
        console.error(
          "sync:catalogo interrompido — a TCGdex bloqueou nosso acesso. " +
            "Não rode de novo antes de resolver o bloqueio.",
        );
        break;
      }
    }
  }

  console.log(houveErroFatal ? "\nsync:catalogo terminou com falhas." : "\nsync:catalogo concluído.");
  process.exitCode = houveErroFatal ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Erro inesperado no sync:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Encerra a conexão do pool para o processo poder sair.
    await client.end();
  });
