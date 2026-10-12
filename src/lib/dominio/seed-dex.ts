/**
 * Formato de `seed/dex-forma.csv` — o catálogo de vagas da Living Dex.
 *
 * O arquivo é escrito por `scripts/gerar-seed-dex.ts` (a partir dos CSVs da
 * PokeAPI, passando por `dex-classificacao.ts`) e lido por
 * `scripts/seed-dex.ts`. Os dois lados usam este módulo, então o formato
 * existe num lugar só.
 *
 * Mesmo dialeto do seed de cartas (`seed-catalogo.ts`): campo vazio sem
 * aspas é NULL, booleano é `t`/`f`, cabeçalho conferido por nome. O arquivo
 * não vai comprimido: são ~1.400 linhas e ~100 KB, e um diff legível numa
 * mudança de classificação vale mais que os bytes.
 */
import type { dexForma } from "@/lib/db/schema";

import { CATEGORIAS_FORMA_DEX, type CategoriaFormaDex, type FormaDex } from "./dex-classificacao";
import type { RegistroCsv } from "./seed-catalogo";

export type LinhaSeedDexForma = typeof dexForma.$inferInsert;

/** Uma vaga do seed: a classificação mais o nome da forma em português (`dex-nomes-forma.ts`). */
export type VagaSeedDex = FormaDex & { formaPt: string | null };

export const COLUNAS_DEX_FORMA = [
  "id",
  "numero",
  "especie",
  "forma",
  "forma_pt",
  "categoria",
  "geracao",
  "lendario",
  "mitico",
  "shiny_obtenivel",
  "sprite",
  "ordem",
] as const;

function exigir(registro: RegistroCsv, coluna: string): string {
  const valor = registro[coluna];
  if (valor === null || valor === undefined || valor === "") {
    throw new Error(`dex-forma.csv: coluna ${coluna} vazia na linha ${registro.id ?? "?"}.`);
  }
  return valor;
}

function inteiro(registro: RegistroCsv, coluna: string): number {
  const texto = exigir(registro, coluna);
  const n = Number(texto);
  if (!Number.isInteger(n)) {
    throw new Error(`dex-forma.csv: ${coluna} = "${texto}" não é inteiro (linha ${registro.id}).`);
  }
  return n;
}

function booleano(registro: RegistroCsv, coluna: string): boolean {
  const texto = exigir(registro, coluna);
  if (texto === "t" || texto === "true") return true;
  if (texto === "f" || texto === "false") return false;
  throw new Error(`dex-forma.csv: ${coluna} = "${texto}" não é booleano (linha ${registro.id}).`);
}

function categoria(registro: RegistroCsv): CategoriaFormaDex {
  const texto = exigir(registro, "categoria");
  if (!(CATEGORIAS_FORMA_DEX as readonly string[]).includes(texto)) {
    throw new Error(`dex-forma.csv: categoria desconhecida "${texto}" (linha ${registro.id}).`);
  }
  return texto as CategoriaFormaDex;
}

export function converterLinhaDexForma(registro: RegistroCsv): LinhaSeedDexForma {
  return {
    id: exigir(registro, "id"),
    numero: inteiro(registro, "numero"),
    especie: exigir(registro, "especie"),
    forma: registro.forma ?? null,
    formaPt: registro.forma_pt ?? null,
    categoria: categoria(registro),
    geracao: inteiro(registro, "geracao"),
    lendario: booleano(registro, "lendario"),
    mitico: booleano(registro, "mitico"),
    shinyObtenivel: booleano(registro, "shiny_obtenivel"),
    sprite: exigir(registro, "sprite"),
    ordem: inteiro(registro, "ordem"),
  };
}

function campoCsv(valor: string | number | boolean | null): string {
  if (valor === null) return "";
  if (typeof valor === "boolean") return valor ? "t" : "f";
  const texto = String(valor);
  if (texto === "") return '""';
  return /[",\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Serializa as vagas no formato que `converterLinhaDexForma` lê. */
export function serializarSeedDex(vagas: readonly VagaSeedDex[]): string {
  const linhas = [COLUNAS_DEX_FORMA.join(",")];
  for (const v of vagas) {
    linhas.push(
      [
        v.id,
        v.numero,
        v.especie,
        v.forma,
        v.formaPt,
        v.categoria,
        v.geracao,
        v.lendario,
        v.mitico,
        v.shinyObtenivel,
        v.sprite,
        v.ordem,
      ]
        .map(campoCsv)
        .join(","),
    );
  }
  return `${linhas.join("\n")}\n`;
}
