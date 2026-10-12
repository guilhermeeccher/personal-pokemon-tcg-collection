/**
 * Living Dex — filtro e contagem da grade da Pokédex. Módulo puro.
 *
 * Duas trilhas (spec §5.2): a normal e a shiny. As vagas das duas são as
 * mesmas formas; a diferença na conta é que forma sem shiny obtenível sai do
 * total da trilha shiny — mas nunca da grade (regra 6).
 *
 * Duas vistas (2026-10-11): a principal e a das cosméticas. As formas
 * cosméticas (63 Alcremie, 20 Vivillon, 28 Unown…) inundavam a grade e o
 * cadastro; passaram a ter lugar e progresso próprios, como a trilha shiny.
 * Vista e trilha são independentes: há cosmética normal e cosmética shiny.
 */
import type { CategoriaFormaDex } from "./dex-classificacao";
import { categoriaConta, type SecoesContadas } from "./dex-secoes";
import { regiaoDoNumero, type Regiao } from "./escopo-pokedex";

export type TrilhaDex = "normal" | "shiny";
export type VistaDex = "principal" | "cosmeticas";

export function vistaDaCategoria(categoria: CategoriaFormaDex): VistaDex {
  return categoria === "cosmetica" ? "cosmeticas" : "principal";
}

export interface FormaParaGrade {
  numero: number;
  especie: string;
  forma: string | null;
  /** Nome oficial da forma em português, quando existe (`dex-nomes-forma.ts`). */
  formaPt?: string | null;
  categoria: CategoriaFormaDex;
  shinyObtenivel: boolean;
}

export interface FiltroGradeDex {
  /** Ausente = as duas vistas. */
  vista?: VistaDex;
  regiao: Regiao | "todas";
  categoria: CategoriaFormaDex | "todas";
  /** Nome da espécie, da forma (em inglês ou português), ou número da Pokédex. */
  busca: string;
}

/** A vaga entra no total desta trilha? */
export function contaNaTrilha(
  forma: Pick<FormaParaGrade, "categoria" | "shinyObtenivel">,
  trilha: TrilhaDex,
  secoes: SecoesContadas,
): boolean {
  if (!categoriaConta(forma.categoria, secoes)) return false;
  return trilha === "normal" || forma.shinyObtenivel;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filtrarFormasDex<T extends FormaParaGrade>(formas: readonly T[], filtro: FiltroGradeDex): T[] {
  const busca = normalizar(filtro.busca);
  const numeroBuscado = /^#?\d+$/.test(busca) ? Number(busca.replace("#", "")) : null;
  return formas.filter((f) => {
    if (filtro.vista && vistaDaCategoria(f.categoria) !== filtro.vista) return false;
    if (filtro.regiao !== "todas" && regiaoDoNumero(f.numero) !== filtro.regiao) return false;
    if (filtro.categoria !== "todas" && f.categoria !== filtro.categoria) return false;
    if (!busca) return true;
    if (numeroBuscado !== null) return f.numero === numeroBuscado;
    return (
      normalizar(f.especie).includes(busca) ||
      normalizar(f.forma ?? "").includes(busca) ||
      normalizar(f.formaPt ?? "").includes(busca)
    );
  });
}

/** Quantas vagas contam em cada trilha, no conjunto dado. */
export function contarVagasDex(
  formas: readonly FormaParaGrade[],
  secoes: SecoesContadas,
): Record<TrilhaDex, number> {
  let normal = 0;
  let shiny = 0;
  for (const f of formas) {
    if (contaNaTrilha(f, "normal", secoes)) normal++;
    if (contaNaTrilha(f, "shiny", secoes)) shiny++;
  }
  return { normal, shiny };
}

/**
 * As vagas que têm uma fêmea separada (a base da espécie, ou o Sneasel de
 * Hisui). É a "macho" do par: a tela diz isso, porque a PokeAPI às vezes
 * nomeia a base ("Male") e às vezes não (Pikachu), e sem o rótulo a linha da
 * base parece genérica ao lado da linha "Fêmea".
 */
export function formasComFemea(formas: readonly { id: string; numero: number; categoria: CategoriaFormaDex }[]): Set<string> {
  const base = new Map(formas.filter((f) => f.categoria === "base").map((f) => [f.numero, f.id]));
  const r = new Set<string>();
  for (const f of formas) {
    if (f.categoria !== "genero") continue;
    const origem = f.id === "sneasel-hisui-femea" ? "sneasel-hisui" : base.get(f.numero);
    if (origem) r.add(origem);
  }
  return r;
}

/**
 * Rótulo da forma na tela: macho e fêmea no idioma da interface; o resto, o
 * nome oficial em português quando a interface está em português e ele
 * existe, senão o nome da PokeAPI em inglês — o mesmo que o HOME mostra.
 */
export function rotuloDaForma(
  f: { id: string; forma: string | null; formaPt?: string | null; categoria: CategoriaFormaDex },
  comFemea: ReadonlySet<string>,
  rotulos: { macho: string; femea: string; portugues?: boolean },
): string | null {
  const nome = rotulos.portugues && f.formaPt ? f.formaPt : f.forma;
  if (f.categoria === "genero") {
    const resto = nome?.replace(/\s*\(?Female\)?$/, "").trim();
    return resto ? `${resto} · ${rotulos.femea}` : rotulos.femea;
  }
  if (comFemea.has(f.id)) {
    return nome && f.forma !== "Male" ? `${nome} · ${rotulos.macho}` : rotulos.macho;
  }
  return nome;
}
