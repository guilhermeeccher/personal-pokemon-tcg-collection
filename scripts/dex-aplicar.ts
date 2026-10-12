/**
 * `pnpm dex:aplicar` — grava o lote de uma sessão de planejamento (spec
 * §7.2): troféus conquistados, planos com tarefas, status de tarefa e de
 * plano, e Pokémon que o usuário disse ter pegado. O lote vem em JSON pelo
 * stdin; o formato e as regras estão em `src/lib/dominio/dex-sessao.ts`.
 *
 *   docker compose exec -T app pnpm dex:aplicar --simular < lote.json
 *   docker compose exec -T app pnpm dex:aplicar < lote.json
 *
 * `--simular` valida e mostra o que entraria, sem gravar: roda sempre
 * antes. O lote é aplicado numa transação só; um item inválido recusa o
 * lote inteiro, e reaplicar o mesmo lote não duplica nada.
 */
import "dotenv/config";

import { client, db } from "../src/lib/db/client";
import { aplicarLoteSessao } from "../src/lib/db/dex-planejamento";
import type { PassoSessao } from "../src/lib/dominio/dex-sessao";
import { moduloLivingDexAtivo } from "../src/lib/modulos";

async function lerStdin(): Promise<string> {
  const partes: Buffer[] = [];
  for await (const p of process.stdin) partes.push(p as Buffer);
  return Buffer.concat(partes).toString("utf8");
}

function descrever(p: PassoSessao): string {
  const alvo = (a: { ref: string } | { id: string }) => ("ref" in a ? `ref ${a.ref}` : `id ${a.id}`);
  switch (p.tipo) {
    case "trofeu":
      return `trophy earned: ${p.trofeuId} on ${p.obtidoEm}`;
    case "plano":
      return `plan: "${p.dados.titulo}" (${p.dados.inicio}${p.dados.fim ? ` to ${p.dados.fim}` : ""})`;
    case "tarefa":
      return `  task: "${p.dados.titulo}" (${p.dados.tipo}) in plan ${alvo(p.plano)}`;
    case "status-tarefa":
      return `task ${alvo(p.tarefa)} → ${p.status}`;
    case "status-plano":
      return `plan ${alvo(p.plano)} → ${p.status}`;
    case "registros":
      return `${p.registros.length} Pokémon registered in ${p.jogoId}`;
  }
}

async function main() {
  if (!moduloLivingDexAtivo()) {
    console.error("dex:aplicar — the Living Dex module is off. Set MODULO_LIVING_DEX=1 to use it.");
    process.exitCode = 1;
    return;
  }
  const simular = process.argv.includes("--simular");
  let json: unknown;
  try {
    json = JSON.parse(await lerStdin());
  } catch {
    console.error("dex:aplicar — stdin is not valid JSON.");
    process.exitCode = 1;
    return;
  }

  const r = await aplicarLoteSessao(db, json, { simular, hoje: new Date().toISOString().slice(0, 10) });
  if (!r.ok) {
    console.error(`dex:aplicar — batch refused, nothing written (${r.erros.length} problem(s)):`);
    for (const e of r.erros) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  if (r.loteJaAplicado) {
    console.log("dex:aplicar — this batch was already applied; nothing to do.");
    return;
  }
  console.log(simular ? "dex:aplicar — SIMULATION, nothing written:" : "dex:aplicar — applied:");
  for (const p of r.passos) console.log(`  ${descrever(p)}`);
  if (r.passos.length === 0) console.log("  (no new items)");
  for (const s of r.pulados) console.log(`  skipped: ${s}`);
}

main()
  .catch((err) => {
    console.error("dex:aplicar failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
