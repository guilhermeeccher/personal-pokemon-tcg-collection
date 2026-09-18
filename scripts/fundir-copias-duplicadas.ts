/**
 * `pnpm fundir:copias-duplicadas` — junta, no inventário que já existe,
 * as cópias que hoje estão em linhas separadas mas são a mesma cópia.
 *
 * Complemento retroativo da fusão no cadastro (2026-08-29). Dali em
 * diante o problema não acontece mais; este script resolve o que ficou
 * para trás — num banco real, em 2026-08-29, era exatamente um
 * par: o Ambipom reverse (`me02-079`), duas linhas idênticas em todos os
 * campos, separadas só pelo instante do cadastro.
 *
 * A regra de "mesma cópia" e o destino de aquisição/notas divergentes
 * são os MESMOS do cadastro (`lib/dominio/fusao-copias.ts`) — não há
 * segunda definição: carta, idioma de catálogo, idioma físico, variante,
 * condição e localização.
 *
 * **Nunca toca em cópia alocada nem em graded.** Linha alocada tem
 * quantidade 1 por invariante (`divisao-lote.ts`) e somar nela faria a
 * vaga apontar para um lote de 2; graded tem certificado único. Grupos
 * com qualquer uma das duas são deixados como estão.
 *
 * A linha mais antiga de cada grupo sobrevive e absorve as outras, que
 * são apagadas. Tudo dentro de uma transação: ou o inventário inteiro
 * fica consistente, ou nada muda.
 *
 * **Rode com `--dry-run` primeiro.** Ele apaga linhas.
 *
 * Uso:
 *   docker compose exec -T app pnpm fundir:copias-duplicadas --dry-run
 *   docker compose exec -T app pnpm fundir:copias-duplicadas
 */
import "dotenv/config";

import { asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo, copia, vaga } from "../src/lib/db/schema";
import { chaveFusaoCopia, fundirCopias } from "../src/lib/dominio/fusao-copias";

async function principal(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const linhas = await db
    .select({
      id: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      idioma: copia.idioma,
      variante: copia.variante,
      condicao: copia.condicao,
      localizacao: copia.localizacao,
      quantidade: copia.quantidade,
      gradedEmpresa: copia.gradedEmpresa,
      aquisicaoData: copia.aquisicaoData,
      aquisicaoOrigem: copia.aquisicaoOrigem,
      aquisicaoPreco: copia.aquisicaoPreco,
      notas: copia.notas,
      cartaNome: cartaCatalogo.nome,
    })
    .from(copia)
    .innerJoin(
      cartaCatalogo,
      sql`${cartaCatalogo.id} = ${copia.cartaId} and ${cartaCatalogo.idioma} = ${copia.idiomaCatalogo}`,
    )
    .where(
      sql`${isNull(copia.gradedEmpresa)} and not exists (
        select 1 from ${vaga} where ${vaga.copiaId} = ${copia.id}
      )`,
    )
    .orderBy(asc(copia.criadoEm));

  const grupos = new Map<string, typeof linhas>();
  for (const l of linhas) {
    const chave = chaveFusaoCopia(l);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(l);
    else grupos.set(chave, [l]);
  }

  const duplicados = [...grupos.values()].filter((g) => g.length > 1);

  if (duplicados.length === 0) {
    console.log("Nenhuma duplicata a fundir.");
    return;
  }

  console.log(`${duplicados.length} grupo(s) de cópias duplicadas:\n`);
  const hoje = new Date().toISOString().slice(0, 10);

  for (const grupo of duplicados) {
    // Já vieram ordenadas por criado_em: a primeira é a mais antiga.
    const [sobrevivente, ...absorvidas] = grupo;
    let acumulada = sobrevivente;
    const divergencias = new Set<string>();

    for (const a of absorvidas) {
      const r = fundirCopias(acumulada, a, hoje);
      for (const d of r.divergencias) divergencias.add(d);
      acumulada = { ...acumulada, ...r };
    }

    console.log(
      `  ${sobrevivente.cartaNome} (${sobrevivente.cartaId}, ${sobrevivente.variante}, ${sobrevivente.condicao}, ${sobrevivente.idioma})`,
    );
    console.log(
      `    ${grupo.length} registros -> 1 com quantidade ${acumulada.quantidade}` +
        (divergencias.size > 0
          ? ` | divergência registrada em notas: ${[...divergencias].join(", ")}`
          : ""),
    );

    if (dryRun) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(copia)
        .set({
          quantidade: acumulada.quantidade,
          aquisicaoData: acumulada.aquisicaoData,
          aquisicaoOrigem: acumulada.aquisicaoOrigem,
          aquisicaoPreco: acumulada.aquisicaoPreco,
          notas: acumulada.notas,
          atualizadoEm: new Date(),
        })
        .where(eq(copia.id, sobrevivente.id));
      await tx.delete(copia).where(
        inArray(
          copia.id,
          absorvidas.map((a) => a.id),
        ),
      );
    });
  }

  console.log(dryRun ? "\n(dry-run — nada foi alterado)" : "\nFusão concluída.");
}

principal()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => client.end());
