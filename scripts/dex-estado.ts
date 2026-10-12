/**
 * `pnpm dex:estado` — o retrato da Living Dex que abre uma sessão de
 * planejamento (spec §7.1): progresso, jogos com troféus e o que cada um
 * alcança agora, Pokémon fora do HOME, planos ativos e tarefas fechadas
 * desde a última sessão. Markdown no stdout; `--json` para o objeto inteiro
 * (com as listas completas de vagas). `--idioma en` troca o título dos
 * troféus (padrão pt-BR).
 *
 * Só lê. Roda com `docker compose exec app pnpm dex:estado`.
 */
import "dotenv/config";

import { client, db } from "../src/lib/db/client";
import { lerSecoesDex, listarFormasDex, listarJogosPossuidos, listarRegistrosDex } from "../src/lib/db/dex";
import { listarPlanos, listarTrofeus, ultimaSessao } from "../src/lib/db/dex-planejamento";
import { naoTransferiveis } from "../src/lib/dominio/dex-disponibilidade";
import { montarRetrato, retratoEmMarkdown } from "../src/lib/dominio/dex-retrato";
import { moduloLivingDexAtivo } from "../src/lib/modulos";

async function main() {
  if (!moduloLivingDexAtivo()) {
    console.error("dex:estado — the Living Dex module is off. Set MODULO_LIVING_DEX=1 to use it.");
    process.exitCode = 1;
    return;
  }
  const args = process.argv.slice(2);
  const idioma = args.includes("--idioma") && args[args.indexOf("--idioma") + 1] === "en" ? "en" : "pt-BR";

  const [formas, registros, secoes, jogos, trofeus, planos, ultima] = await Promise.all([
    listarFormasDex(db),
    listarRegistrosDex(db),
    lerSecoesDex(db),
    listarJogosPossuidos(db),
    listarTrofeus(db),
    listarPlanos(db),
    ultimaSessao(db),
  ]);
  const retrato = montarRetrato({
    hoje: new Date().toISOString().slice(0, 10),
    idioma,
    formas,
    registros,
    secoes,
    naoTransferiveis: naoTransferiveis(),
    jogos,
    trofeus,
    planos,
    ultimaSessao: ultima?.toISOString() ?? null,
  });

  if (args.includes("--json")) {
    console.log(JSON.stringify(retrato, null, 2));
    return;
  }
  const titulo = new Map(trofeus.map((t) => [t.id, t.textos[idioma].titulo]));
  console.log(retratoEmMarkdown(retrato, (id) => titulo.get(id) ?? id));
}

main()
  .catch((err) => {
    console.error("dex:estado failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
