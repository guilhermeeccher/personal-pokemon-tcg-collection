/**
 * `pnpm seed:dex` — carrega `seed/dex-forma.csv` em `dex_forma`, o catálogo
 * de vagas da Living Dex, e `seed/dex-trofeus.json` em `dex_trofeu`, os
 * troféus de cada jogo. Roda em todo boot (`docker/entrypoint.sh`).
 *
 * **Só com o módulo ligado** (`MODULO_LIVING_DEX=1`). Desligado, sai na hora
 * sem tocar o banco: quem não usa o módulo não ganha 1.400 linhas que nunca
 * vai ler. Ao ligar o módulo, o próximo boot carrega.
 *
 * ## Contrato
 *
 *  - **Idempotente.** Upsert pelo `id`. Rodar duas vezes não muda nada.
 *  - **Roda sempre, não só com a tabela vazia** — diferente do seed de cartas.
 *    O catálogo é pequeno (~1.400 linhas, menos de um segundo) e a única
 *    fonte dele é este arquivo: uma correção de classificação ou um shiny
 *    liberado chegam na instalação no boot seguinte, sem passo manual.
 *  - **Quem saiu do arquivo é inativado, nunca apagado.** Aqui o arquivo é a
 *    fonte, então forma que não está nele não é mais vaga. A linha fica,
 *    com `ativa = false`, porque um registro do usuário pode apontar para
 *    ela. Também por isso é seguro: nenhuma vaga some do banco. Vale igual
 *    para o troféu: uma conquista ou tarefa do usuário pode apontar para ele.
 *  - **Tudo numa transação.** Um arquivo inválido não deixa o catálogo pela
 *    metade.
 *  - **Nunca bloqueia o uso.** Falha registra erro e sai com código 1; o
 *    entrypoint segue subindo o servidor.
 *  - **Zero rede, e nenhuma tabela de cartas tocada.**
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { notInArray, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { dexForma, dexTrofeu } from "../src/lib/db/schema";
import { lerRegistrosCsv } from "../src/lib/dominio/seed-catalogo";
import { lerSeedTrofeus } from "../src/lib/dominio/dex-trofeus";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "../src/lib/dominio/seed-dex";
import { moduloLivingDexAtivo } from "../src/lib/modulos";

const ARQUIVO = path.resolve(process.cwd(), "seed", "dex-forma.csv");
const ARQUIVO_TROFEUS = path.resolve(process.cwd(), "seed", "dex-trofeus.json");

/** 500 × 13 colunas = 6.500 parâmetros, longe do teto de 65.535. */
const TAMANHO_LOTE = 500;

async function main() {
  if (!moduloLivingDexAtivo()) {
    console.log("seed:dex — the Living Dex module is off (MODULO_LIVING_DEX); nothing to do.");
    return;
  }
  if (!fs.existsSync(ARQUIVO)) {
    throw new Error(`Seed file not found: ${ARQUIVO}. Run the script from the project root.`);
  }

  const linhas = lerRegistrosCsv(fs.readFileSync(ARQUIVO, "utf8"), COLUNAS_DEX_FORMA).map(
    converterLinhaDexForma,
  );
  const agora = new Date();

  const inativadas = await db.transaction(async (tx) => {
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE).map((l) => ({ ...l, ativa: true, atualizadoEm: agora }));
      await tx
        .insert(dexForma)
        .values(lote)
        .onConflictDoUpdate({
          target: dexForma.id,
          set: {
            numero: sql`excluded.numero`,
            especie: sql`excluded.especie`,
            forma: sql`excluded.forma`,
            formaPt: sql`excluded.forma_pt`,
            categoria: sql`excluded.categoria`,
            geracao: sql`excluded.geracao`,
            lendario: sql`excluded.lendario`,
            mitico: sql`excluded.mitico`,
            shinyObtenivel: sql`excluded.shiny_obtenivel`,
            sprite: sql`excluded.sprite`,
            ordem: sql`excluded.ordem`,
            ativa: sql`true`,
            atualizadoEm: sql`excluded.atualizado_em`,
          },
        });
    }
    return tx
      .update(dexForma)
      .set({ ativa: false, atualizadoEm: agora })
      .where(
        sql`${dexForma.ativa} and ${notInArray(
          dexForma.id,
          linhas.map((l) => l.id),
        )}`,
      )
      .returning({ id: dexForma.id });
  });

  console.log(`seed:dex — ${linhas.length} slots upserted into dex_forma.`);
  if (inativadas.length > 0) {
    console.log(`  deactivated (no longer in the file): ${inativadas.map((r) => r.id).join(", ")}`);
  }

  await semearTrofeus(agora);
}

/** Mesmo contrato do catálogo de formas: upsert, inativa quem saiu, uma transação. */
async function semearTrofeus(agora: Date) {
  const trofeus = lerSeedTrofeus(JSON.parse(fs.readFileSync(ARQUIVO_TROFEUS, "utf8")));
  const inativados = await db.transaction(async (tx) => {
    if (trofeus.length > 0) {
      await tx
        .insert(dexTrofeu)
        .values(
          trofeus.map((t) => ({
            id: t.id,
            jogoId: t.jogoId,
            tipo: t.tipo,
            nivel: t.nivel,
            ordem: t.ordem,
            textos: t.textos,
            requer: t.requer,
            libera: t.libera,
            fonte: t.fonte,
            ativo: true,
            atualizadoEm: agora,
          })),
        )
        .onConflictDoUpdate({
          target: dexTrofeu.id,
          set: {
            jogoId: sql`excluded.jogo_id`,
            tipo: sql`excluded.tipo`,
            nivel: sql`excluded.nivel`,
            ordem: sql`excluded.ordem`,
            textos: sql`excluded.textos`,
            requer: sql`excluded.requer`,
            libera: sql`excluded.libera`,
            fonte: sql`excluded.fonte`,
            ativo: sql`true`,
            atualizadoEm: sql`excluded.atualizado_em`,
          },
        });
    }
    return tx
      .update(dexTrofeu)
      .set({ ativo: false, atualizadoEm: agora })
      .where(
        sql`${dexTrofeu.ativo} and ${notInArray(
          dexTrofeu.id,
          trofeus.map((t) => t.id),
        )}`,
      )
      .returning({ id: dexTrofeu.id });
  });
  console.log(`seed:dex — ${trofeus.length} trophies upserted into dex_trofeu.`);
  if (inativados.length > 0) {
    console.log(`  deactivated (no longer in the file): ${inativados.map((r) => r.id).join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error("Failed to seed the Living Dex catalog:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
