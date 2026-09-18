/**
 * `pnpm importar:tipos-catalogo` — preenche `carta_catalogo.tipos` lendo
 * o clone local do repositório de dados da TCGdex. **Nenhuma requisição
 * à API.**
 *
 * Por que existe: a exportação para a LigaPokemon tem uma coluna "Cor",
 * que é o tipo da carta (`D` para Darkness no arquivo de exemplo do
 * próprio site). O nosso catálogo nunca importou esse campo — o sync
 * da API não o traz —, mas ele está no repositório, em `types`.
 *
 * Percorre `data/` (ocidental) e `data-asia/` (japonês), lê o id de cada
 * set no arquivo do próprio set e casa as cartas por `<setId>-<arquivo>`,
 * que é exatamente como o nosso `carta_catalogo.id` é montado.
 *
 * **Escopo mínimo, deliberado: só escreve `tipos`.** Não toca em nome,
 * raridade, imagem, dexIds nem em nada mais, não insere nem remove linha.
 * Idempotente — repetir reescreve o mesmo valor.
 *
 * Uso:
 *   docker compose exec -T app pnpm importar:tipos-catalogo
 *   docker compose exec -T app pnpm importar:tipos-catalogo --dry-run
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { eq, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";

const REPO_PATH = process.env.TCGDEX_REPO_PATH ?? "/upstream-dados-tcgdex";
const PASTAS = ["data", "data-asia"];
const TAMANHO_LOTE = 500;

async function importarModulo(caminho: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(caminho).href)) as { default: unknown };
  return mod.default;
}

function subpastas(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

function arquivosTs(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => e.name);
}

/** `<pasta do set>.ts` fica ao lado da pasta, com o mesmo nome. */
function caminhoDoArquivoDoSet(pastaDoSet: string): string {
  return `${pastaDoSet}.ts`;
}

interface Coletado {
  cartaId: string;
  tipos: string[];
}

async function coletar(): Promise<{ itens: Coletado[]; setsSemId: string[]; erros: string[] }> {
  const itens: Coletado[] = [];
  const setsSemId: string[] = [];
  const erros: string[] = [];

  for (const pasta of PASTAS) {
    for (const pastaSerie of subpastas(path.join(REPO_PATH, pasta))) {
      for (const pastaSet of subpastas(pastaSerie)) {
        const arquivoSet = caminhoDoArquivoDoSet(pastaSet);
        if (!fs.existsSync(arquivoSet)) {
          setsSemId.push(pastaSet);
          continue;
        }

        let setId: string | undefined;
        try {
          const setBruto = (await importarModulo(arquivoSet)) as { id?: unknown };
          if (typeof setBruto?.id === "string") setId = setBruto.id;
        } catch (erro) {
          erros.push(`${arquivoSet}: ${String(erro)}`);
          continue;
        }
        if (!setId) {
          setsSemId.push(pastaSet);
          continue;
        }

        for (const arquivo of arquivosTs(pastaSet)) {
          const localId = arquivo.replace(/\.ts$/, "");
          try {
            const carta = (await importarModulo(path.join(pastaSet, arquivo))) as {
              types?: unknown;
            };
            const tipos = Array.isArray(carta?.types)
              ? carta.types.filter((t): t is string => typeof t === "string")
              : [];
            // Carta sem tipo (Treinador, Energia) não vira UPDATE: o
            // default da coluna já é vazio, e escrever vazio em 30 mil
            // linhas só gastaria tempo.
            if (tipos.length > 0) itens.push({ cartaId: `${setId}-${localId}`, tipos });
          } catch (erro) {
            erros.push(`${arquivo}: ${String(erro)}`);
          }
        }
      }
    }
  }

  return { itens, setsSemId, erros };
}

async function principal(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(REPO_PATH)) {
    console.error(`Clone não encontrado em ${REPO_PATH}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Lendo ${REPO_PATH}…`);
  const { itens, setsSemId, erros } = await coletar();
  console.log(`${itens.length} carta(s) com tipo no repositório.`);
  if (setsSemId.length > 0) console.log(`  ${setsSemId.length} pasta(s) de set sem arquivo de id (ignoradas).`);
  if (erros.length > 0) console.log(`  ${erros.length} arquivo(s) com erro de leitura.`);

  if (dryRun) {
    for (const i of itens.slice(0, 10)) console.log(`  ${i.cartaId} -> ${i.tipos.join(", ")}`);
    console.log("\n(dry-run — nada foi gravado)");
    return;
  }

  // Um UPDATE por lote, casando por id (vale para os três idiomas da
  // mesma carta — o tipo é da carta, não da impressão).
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE);
    await db.transaction(async (tx) => {
      for (const item of lote) {
        await tx
          .update(cartaCatalogo)
          .set({ tipos: item.tipos })
          .where(eq(cartaCatalogo.id, item.cartaId));
      }
    });
    console.log(`  ${Math.min(i + TAMANHO_LOTE, itens.length)}/${itens.length}…`);
  }

  const [{ comTipo }] = await db
    .select({ comTipo: sql<number>`count(*)::int` })
    .from(cartaCatalogo)
    .where(sql`cardinality(${cartaCatalogo.tipos}) > 0`);

  console.log(`\nLinhas de catálogo com tipo agora: ${comTipo}.`);
}

principal()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => client.end());
