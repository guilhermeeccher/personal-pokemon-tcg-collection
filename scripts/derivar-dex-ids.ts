/**
 * `pnpm derivar:dex-ids` — preenche o número da Pokédex das cartas que a
 * TCGdex publica sem `dexId`, deduzindo a espécie do nome da carta.
 *
 * O porquê e o como estão em `lib/dominio/dex-id-derivado.ts`. Em uma
 * linha: 586 cartas de categoria Pokémon não têm número no upstream — o
 * mecanismo de "Pokémon de personagem" ("Diglett da Equipe Rocket") e
 * boa parte das `ex`/Mega japonesas —, e sem número a regra 2 as mantém
 * fora da Pokédex para sempre, mesmo com a carta física na mão.
 *
 * **O índice de espécies é montado só com linhas do upstream**
 * (`dex_ids_derivado = false`). Deduzir a partir de dedução deixaria um
 * erro se propagar em cadeia, e o custo de manter a regra é zero: a
 * espécie sempre existe em alguma carta que o upstream numerou.
 *
 * Idempotente: só olha linha com `dex_ids` vazio, então repetir não muda
 * nada. Nunca sobrescreve número existente e nunca chuta — ambiguidade ou
 * espécie desconhecida ficam como estão, e aparecem no resumo.
 *
 * **Rode com `--dry-run` primeiro.**
 *
 * Uso:
 *   docker compose exec -T app pnpm derivar:dex-ids --dry-run
 *   docker compose exec -T app pnpm derivar:dex-ids
 *   docker compose exec -T app pnpm derivar:dex-ids --idioma pt
 */
import "dotenv/config";

import { and, eq, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";
import {
  derivarDexId,
  indexarEspeciesConhecidas,
} from "../src/lib/dominio/dex-id-derivado";
import type { Idioma } from "../src/lib/dominio/enums";

/** pt grava "Pokémon"; en e jp gravam "Pokemon". */
const CATEGORIA_POKEMON = sql`${cartaCatalogo.categoria} ilike 'pok%mon'`;
const SEM_DEX = sql`cardinality(${cartaCatalogo.dexIds}) = 0`;

function lerIdioma(argv: string[]): Idioma | undefined {
  const i = argv.indexOf("--idioma");
  if (i === -1) return undefined;
  const valor = argv[i + 1];
  if (!["pt", "en", "jp"].includes(valor)) {
    throw new Error(`Invalid language: ${valor}`);
  }
  return valor as Idioma;
}

async function principal(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const idioma = lerIdioma(process.argv.slice(2));

  // Índice: só o que o upstream numerou, exatamente um número.
  const conhecidas = await db
    .select({
      nome: cartaCatalogo.nome,
      idioma: cartaCatalogo.idioma,
      dexId: sql<number>`${cartaCatalogo.dexIds}[1]`,
    })
    .from(cartaCatalogo)
    .where(
      and(
        sql`cardinality(${cartaCatalogo.dexIds}) = 1`,
        eq(cartaCatalogo.dexIdsDerivado, false),
      ),
    );

  const indice = indexarEspeciesConhecidas(
    conhecidas.map((l) => ({ nome: l.nome, idioma: l.idioma, dexId: Number(l.dexId) })),
  );
  console.log(`${conhecidas.length} row(s) numbered upstream -> ${indice.size} known species.`);

  const pendentes = await db
    .select({
      id: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      nome: cartaCatalogo.nome,
      setId: cartaCatalogo.setId,
    })
    .from(cartaCatalogo)
    .where(
      and(
        CATEGORIA_POKEMON,
        SEM_DEX,
        ...(idioma ? [eq(cartaCatalogo.idioma, idioma)] : []),
      ),
    )
    .orderBy(cartaCatalogo.idioma, cartaCatalogo.setId, cartaCatalogo.localId);

  console.log(`${pendentes.length} Pokémon card(s) with no number.\n`);
  if (pendentes.length === 0) return;

  let derivadas = 0;
  const semResolucao: { idioma: string; nome: string }[] = [];

  for (const carta of pendentes) {
    const dexId = derivarDexId(carta.nome, carta.idioma, indice);
    if (dexId === null) {
      semResolucao.push({ idioma: carta.idioma, nome: carta.nome });
      continue;
    }
    derivadas += 1;
    if (derivadas <= 15) {
      console.log(`  ${carta.idioma} ${carta.id.padEnd(14)} ${carta.nome.slice(0, 32).padEnd(32)} -> ${dexId}`);
    }
    if (dryRun) continue;

    await db
      .update(cartaCatalogo)
      .set({ dexIds: [dexId], dexIdsDerivado: true, atualizadoEm: new Date() })
      .where(
        and(eq(cartaCatalogo.id, carta.id), eq(cartaCatalogo.idioma, carta.idioma)),
      );
  }

  if (derivadas > 15) console.log(`  … and ${derivadas - 15} more.`);

  console.log(`\nDerived: ${derivadas} | unresolved: ${semResolucao.length}`);
  if (semResolucao.length > 0) {
    console.log("Unresolved (they stay out of the Pokédex, as before):");
    for (const s of semResolucao.slice(0, 20)) {
      console.log(`  ${s.idioma} ${s.nome}`);
    }
    if (semResolucao.length > 20) console.log(`  … and ${semResolucao.length - 20} more.`);
  }
  if (dryRun) console.log("\n(dry-run — nothing was written)");
}

principal()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => client.end());
