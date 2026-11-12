/**
 * O que é puro no comando `pnpm sync:catalogo` (`scripts/sync-catalogo.ts`):
 * ler os argumentos. O sync em si é `sincronizarCatalogo`, em
 * `lib/sync/catalogo.ts`; aqui não há banco nem rede.
 *
 * ## Por que `--idioma` existe
 *
 * O catálogo japonês de uma instalação nascida do seed veio do repositório
 * de dados da TCGdex (`importar:catalogo-repo`), não da API, e as duas fontes
 * não listam os mesmos sets: em 2026-09-22 a API tinha 184 sets japoneses e o
 * catálogo, 117. Um `sync:catalogo` nos três idiomas buscaria carta a carta
 * todo set japonês que a API tem e o catálogo não. Por isso a atualização
 * passou a rodar o sync só em pt e en e trazer o japonês pelo importador — e,
 * sem esta opção, isso exigia uma cópia do script, feita à mão dentro do
 * container, com a lista de idiomas editada.
 *
 * ## Argumento desconhecido recusa a rodada
 *
 * Antes, o script só procurava `--profundo` e ignorava o resto. Com
 * `--idioma`, ignorar deixou de ser inofensivo: um `--idoma pt,en` digitado
 * errado rodaria os três idiomas, que é exatamente o volume que a opção
 * existe para evitar. Então qualquer argumento que não seja reconhecido
 * falha antes de tocar a rede, com o código 2.
 */

import { IDIOMAS, type Idioma } from "./enums";

export const SAIDA_USO_SYNC = 2;

export const USO_SYNC_CATALOGO = [
  "usage: pnpm sync:catalogo [--idioma pt,en,jp] [--profundo]",
  "",
  "  Syncs the TCGdex catalog from the API. Incremental unless --profundo.",
  "",
  "  --idioma L[,L]   only these languages (pt, en, jp), comma-separated; default all three",
  "  --profundo       revisit every set card by card (also SYNC_PROFUNDO=1)",
  "",
  "  exit codes: 0 ok, 1 a language failed or the API blocked us, 2 wrong usage",
].join("\n");

export interface ArgumentosSyncCatalogo {
  /** Na ordem canônica (`IDIOMAS`), sem repetição. */
  idiomas: Idioma[];
  profundo: boolean;
  ajuda: boolean;
}

/**
 * `pt,en` → `["pt", "en"]`. Devolve a lista na ordem canônica, não na
 * digitada: a ordem dos idiomas não muda o resultado, e uma ordem fixa deixa
 * o log de duas rodadas comparável. Repetição é aceita e some; idioma
 * desconhecido ou lista vazia é erro. `ja` é recusado de propósito, mesmo
 * sendo o código da URL: o comando fala a língua do banco, onde o japonês é
 * `jp` (AGENTS.md).
 */
function lerIdiomas(texto: string | undefined): { ok: true; idiomas: Idioma[] } | { ok: false; erro: string } {
  if (texto === undefined || texto.startsWith("--")) {
    return { ok: false, erro: "--idioma needs a language list, e.g. --idioma pt,en." };
  }
  const pedidos = texto.split(",").map((s) => s.trim());
  const desconhecidos = pedidos.filter((s) => !(IDIOMAS as readonly string[]).includes(s));
  if (desconhecidos.length > 0) {
    const lista = desconhecidos.map((s) => (s === "" ? "(empty)" : `"${s}"`)).join(", ");
    return { ok: false, erro: `unknown language ${lista} in --idioma (use ${IDIOMAS.join(", ")}).` };
  }
  return { ok: true, idiomas: IDIOMAS.filter((i) => pedidos.includes(i)) };
}

/**
 * Lê `process.argv.slice(2)`. Aceita `--idioma pt,en` e `--idioma=pt,en`, e
 * ignora um `--` solto (há gerenciador de pacotes que o repassa ao script).
 * `SYNC_PROFUNDO` não é lido aqui: o ambiente é do script, que o soma a
 * `profundo`.
 */
export function lerArgumentosSyncCatalogo(
  argv: readonly string[],
): { ok: true; args: ArgumentosSyncCatalogo } | { ok: false; erro: string } {
  const args: ArgumentosSyncCatalogo = { idiomas: [...IDIOMAS], profundo: false, ajuda: false };
  let idiomaDado = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--profundo") args.profundo = true;
    else if (a === "--help" || a === "-h") args.ajuda = true;
    else if (a === "--idioma" || a.startsWith("--idioma=")) {
      const texto = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      const lidos = lerIdiomas(texto);
      if (!lidos.ok) return lidos;
      if (idiomaDado) return { ok: false, erro: "--idioma given more than once; list the languages in one, e.g. --idioma pt,en." };
      idiomaDado = true;
      args.idiomas = lidos.idiomas;
    } else {
      return { ok: false, erro: `unknown argument "${a}".` };
    }
  }
  return { ok: true, args };
}
