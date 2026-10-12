/**
 * Living Dex — os troféus do HOME, calculados dos registros. Módulo puro.
 *
 * Os troféus dos jogos são marcados pelo usuário (ou numa sessão); os do HOME
 * nunca: valem enquanto os registros cumprem a regra declarada no arquivo
 * (`RegraTrofeuHome`), e deixam de valer se um Pokémon sai do HOME. Por isso
 * não têm data. A lista e as regras estão em `seed/dex-trofeus.json`
 * (`jogo: "home"`), decididas em 2026-10-12.
 *
 * Contam só as vagas que contam na trilha (`contaNaTrilha`), como a Pokédex:
 * desligar uma seção tira as vagas dela de "região completa".
 */
import { estadoDaVaga, type MapaEstadosDex } from "./dex-estado";
import { contaNaTrilha, vistaDaCategoria, type FormaParaGrade } from "./dex-grade";
import type { SecoesContadas } from "./dex-secoes";
import { JOGO_HOME, type RegraTrofeuHome } from "./dex-trofeus";
import { regiaoDoNumero } from "./escopo-pokedex";
import type { TrofeuDexDTO } from "./tipos-cliente";

export type FormaParaTrofeuHome = Pick<FormaParaGrade, "numero" | "categoria" | "shinyObtenivel"> & { id: string };

/** A regra está cumprida pelos registros de agora? */
export function regraCumprida(
  regra: RegraTrofeuHome,
  formas: readonly FormaParaTrofeuHome[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
): boolean {
  const naTrilha = formas.filter((f) => contaNaTrilha(f, regra.trilha, secoes));
  const noHome = (f: FormaParaTrofeuHome) => estadoDaVaga(mapa, f.id, regra.trilha) === "no_home";
  const todasNoHome = (vagas: readonly FormaParaTrofeuHome[]) => vagas.length > 0 && vagas.every(noHome);
  switch (regra.tipo) {
    case "quantidade":
      return naTrilha.filter(noHome).length >= regra.quantidade;
    case "regiao":
      return todasNoHome(
        naTrilha.filter((f) => vistaDaCategoria(f.categoria) === "principal" && regiaoDoNumero(f.numero) === regra.regiao),
      );
    case "vista":
      return todasNoHome(naTrilha.filter((f) => vistaDaCategoria(f.categoria) === regra.vista));
  }
}

/** Ids dos troféus calculados cumpridos agora. */
export function trofeusHomeConquistados(
  trofeus: readonly { id: string; regra: RegraTrofeuHome | null }[],
  formas: readonly FormaParaTrofeuHome[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
): Set<string> {
  const r = new Set<string>();
  for (const t of trofeus) if (t.regra && regraCumprida(t.regra, formas, mapa, secoes)) r.add(t.id);
  return r;
}

/**
 * A lista de troféus com a conquista dos do HOME preenchida pelo cálculo:
 * sem data, `origem: "calculado"`. Os outros passam como estão.
 */
export function comTrofeusDoHome(
  trofeus: readonly TrofeuDexDTO[],
  formas: readonly FormaParaTrofeuHome[],
  mapa: MapaEstadosDex,
  secoes: SecoesContadas,
): TrofeuDexDTO[] {
  const conquistados = trofeusHomeConquistados(
    trofeus.filter((t) => t.jogoId === JOGO_HOME),
    formas,
    mapa,
    secoes,
  );
  return trofeus.map((t) =>
    t.jogoId !== JOGO_HOME
      ? t
      : { ...t, obtido: conquistados.has(t.id) ? { em: null, origem: "calculado" as const, notas: null } : null },
  );
}
