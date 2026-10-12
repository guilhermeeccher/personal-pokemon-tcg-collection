/**
 * `pnpm gerar:seed-dex --pokeapi <pasta>` — regenera `seed/dex-forma.csv`, o
 * catálogo de vagas da Living Dex, a partir dos CSVs da PokeAPI.
 *
 * `<pasta>` é o `data/v2/csv/` de um clone de `github.com/PokeAPI/pokeapi`
 * (`git clone --depth 1`). Zero requisição de rede: lê arquivo local, como o
 * importador do catálogo de cartas lê o clone da TCGdex.
 *
 * A classificação vive em `lib/dominio/dex-classificacao.ts`. Se a PokeAPI
 * trouxer uma forma que nenhuma regra conhece, ou uma forma sem nome, este
 * script **falha e lista quais são** — e nada é escrito. A decisão de onde a
 * forma entra é de quem mantém o projeto, numa regra nova, nunca do script.
 *
 * Depois de regerar: conferir o `git diff seed/dex-forma.csv` (o arquivo não
 * é comprimido para esse diff ser legível) e rodar `pnpm seed:dex`.
 */
import fs from "node:fs";
import path from "node:path";

import {
  classificarFormasDex,
  type EspeciePokeapi,
  type FormaPokeapi,
  type PokemonPokeapi,
} from "../src/lib/dominio/dex-classificacao";
import { analisarCsv, type CampoCsv } from "../src/lib/dominio/seed-catalogo";
import { serializarSeedDex } from "../src/lib/dominio/seed-dex";

/** `local_language_id` do inglês na PokeAPI. */
const IDIOMA_INGLES = "9";

const ARQUIVO_SAIDA = path.resolve(process.cwd(), "seed", "dex-forma.csv");

type Registro = Record<string, CampoCsv>;

/**
 * Lê um CSV da PokeAPI exigindo só as colunas usadas. Coluna nova do lado
 * deles não quebra a leitura; coluna que sumiu ou mudou de nome, sim.
 */
function lerCsvPokeapi(pasta: string, nome: string, colunas: readonly string[]): Registro[] {
  const caminho = path.join(pasta, `${nome}.csv`);
  if (!fs.existsSync(caminho)) {
    throw new Error(`File not found: ${caminho}. Point --pokeapi at data/v2/csv of a PokeAPI clone.`);
  }
  const [cabecalho, ...linhas] = analisarCsv(fs.readFileSync(caminho, "utf8"));
  const nomes = (cabecalho ?? []).map((c) => c ?? "");
  const faltando = colunas.filter((c) => !nomes.includes(c));
  if (faltando.length > 0) {
    throw new Error(`${nome}.csv is missing columns: ${faltando.join(", ")}.`);
  }
  return linhas
    .filter((campos) => !(campos.length === 1 && campos[0] === null))
    .map((campos) => Object.fromEntries(nomes.map((n, i) => [n, campos[i] ?? null])));
}

const num = (v: CampoCsv) => Number(v);
const bool = (v: CampoCsv) => v === "1";

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const pasta = argumento("--pokeapi");
  if (!pasta) {
    throw new Error("Usage: pnpm gerar:seed-dex --pokeapi <pokeapi clone>/data/v2/csv");
  }

  const nomesForma = new Map(
    lerCsvPokeapi(pasta, "pokemon_form_names", ["pokemon_form_id", "local_language_id", "form_name"])
      .filter((r) => r.local_language_id === IDIOMA_INGLES)
      .map((r) => [num(r.pokemon_form_id), r.form_name]),
  );
  const nomesEspecie = new Map(
    lerCsvPokeapi(pasta, "pokemon_species_names", ["pokemon_species_id", "local_language_id", "name"])
      .filter((r) => r.local_language_id === IDIOMA_INGLES)
      .map((r) => [num(r.pokemon_species_id), r.name]),
  );

  const formas: FormaPokeapi[] = lerCsvPokeapi(pasta, "pokemon_forms", [
    "id",
    "identifier",
    "form_identifier",
    "pokemon_id",
    "is_default",
    "is_battle_only",
    "is_mega",
    "order",
  ]).map((r) => ({
    id: num(r.id),
    identificador: r.identifier ?? "",
    identificadorForma: r.form_identifier || null,
    pokemonId: num(r.pokemon_id),
    padrao: bool(r.is_default),
    soBatalha: bool(r.is_battle_only),
    mega: bool(r.is_mega),
    ordem: num(r.order),
    nomeForma: nomesForma.get(num(r.id)) || null,
  }));

  const pokemons: PokemonPokeapi[] = lerCsvPokeapi(pasta, "pokemon", ["id", "species_id", "is_default"]).map(
    (r) => ({ id: num(r.id), especieId: num(r.species_id), padrao: bool(r.is_default) }),
  );

  const especies: EspeciePokeapi[] = lerCsvPokeapi(pasta, "pokemon_species", [
    "id",
    "identifier",
    "generation_id",
    "has_gender_differences",
    "is_legendary",
    "is_mythical",
  ]).map((r) => {
    const id = num(r.id);
    const nome = nomesEspecie.get(id);
    if (!nome) throw new Error(`Species ${id} has no English name in pokemon_species_names.csv.`);
    return {
      id,
      identificador: r.identifier ?? "",
      nome,
      geracao: num(r.generation_id),
      diferencaGenero: bool(r.has_gender_differences),
      lendario: bool(r.is_legendary),
      mitico: bool(r.is_mythical),
    };
  });

  const { vagas, semClassificacao, semNome } = classificarFormasDex({ formas, pokemons, especies });

  if (semClassificacao.length > 0 || semNome.length > 0) {
    if (semClassificacao.length > 0) {
      console.error(`Forms with no classification rule (${semClassificacao.length}):`);
      for (const id of semClassificacao) console.error(`  ${id}`);
    }
    if (semNome.length > 0) {
      console.error(`Included forms with no name (${semNome.length}):`);
      for (const id of semNome) console.error(`  ${id}`);
    }
    console.error("\nNothing was written. Add a rule in src/lib/dominio/dex-classificacao.ts.");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(ARQUIVO_SAIDA, serializarSeedDex(vagas));

  const porCategoria = new Map<string, number>();
  for (const v of vagas) porCategoria.set(v.categoria, (porCategoria.get(v.categoria) ?? 0) + 1);
  console.log(`gerar:seed-dex — ${vagas.length} slots written to ${ARQUIVO_SAIDA}`);
  for (const [categoria, total] of porCategoria) console.log(`  ${categoria}: ${total}`);
  console.log(`  no shiny released: ${vagas.filter((v) => !v.shinyObtenivel).length}`);
}

main();
