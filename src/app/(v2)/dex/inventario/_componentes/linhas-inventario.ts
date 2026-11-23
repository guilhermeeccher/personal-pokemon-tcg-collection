/**
 * O que o inventário da Dex na v2 mostra, sem pele: os mesmos filtros, o
 * mesmo agrupamento e a mesma ordem da v1 (`(v1)/v1/dex/inventario/
 * inventario-dex.tsx`), tirados da tela para o teste provar que os mesmos
 * dados dão as mesmas linhas (DINV-01, `VIEW`).
 *
 * O banco guarda **um registro por Pokémon**; o grupo existe só aqui
 * (`agruparInventario`), e cada ação da tela age sobre um id dele (AGENTS.md,
 * "One row per Pokémon in the database, grouped only on screen").
 */

import { filtrarFormasDex } from "@/lib/dominio/dex-grade";
import { agruparInventario, compararPorNome, type GrupoInventario } from "@/lib/dominio/dex-inventario";
import { LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";

export interface FiltrosInventarioDex {
  /** `""` é qualquer lugar; senão `home` ou o id de um jogo. */
  local: string;
  busca: string;
  soShiny: boolean;
}

export const FILTROS_INVENTARIO_VAZIOS: FiltrosInventarioDex = { local: "", busca: "", soShiny: false };

export interface LinhaInventarioDex {
  grupo: GrupoInventario;
  forma: FormaDexDTO;
}

/**
 * Filtra os registros, agrupa os idênticos e ordena por nome. A busca é a da
 * Pokédex (espécie, forma nos dois idiomas, ou o número). Um registro cuja
 * vaga saiu do catálogo some da lista, como na v1: sem a vaga não há nome
 * nem sprite para mostrar.
 */
export function linhasDoInventario(
  registros: readonly RegistroDexDTO[],
  formas: readonly FormaDexDTO[],
  filtros: FiltrosInventarioDex,
): LinhaInventarioDex[] {
  const formaPorId = new Map(formas.map((f) => [f.id, f]));
  const permitidas = filtros.busca.trim()
    ? new Set(filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca: filtros.busca }).map((f) => f.id))
    : null;
  return agruparInventario(
    registros.filter(
      (r) =>
        (!filtros.local || r.local === filtros.local) &&
        (!filtros.soShiny || r.shiny) &&
        (!permitidas || permitidas.has(r.formaId)),
    ),
  )
    .flatMap((grupo) => {
      const forma = formaPorId.get(grupo.formaId);
      return forma ? [{ grupo, forma }] : [];
    })
    .sort((a, b) => compararPorNome(a.forma, b.forma));
}

/** Pokémon nas linhas (a soma dos grupos), para o "N grupos · M Pokémon". */
export function totalDePokemon(linhas: readonly LinhaInventarioDex[]): number {
  return linhas.reduce((soma, l) => soma + l.grupo.ids.length, 0);
}

/**
 * Quantos filtros do painel recolhível estão ligados: o lugar e o "só
 * shiny". A busca fica sempre à vista e não entra na conta, como na v1.
 */
export function filtrosNoPainel(filtros: FiltrosInventarioDex): number {
  return (filtros.local ? 1 : 0) + (filtros.soShiny ? 1 : 0);
}

/**
 * Para onde "Mover 1 para…" oferece levar um grupo: o HOME e os jogos ativos,
 * menos onde ele já está — a lista da v1. A tela não adivinha as regras de
 * ida e volta: um destino que o HOME não deixa (um jogo só de envio, o
 * Let's Go para quem não veio dele) é recusado pelo servidor, e a frase da
 * recusa aparece (DINV-03, `REF`). Um jogo parado não recebe nada novo, por
 * isso fica de fora.
 */
export function destinosDoGrupo(local: string, jogos: readonly JogoPossuidoDTO[]): string[] {
  return [LOCAL_HOME, ...jogos.filter((j) => j.ativo).map((j) => j.jogoId)].filter((d) => d !== local);
}

/**
 * O registro que "Enviar 1" e "Mover 1" movem é o mais antigo do grupo, e o
 * que "Apagar 1" apaga é o mais novo — o que a v1 faz. Apagar é para
 * lançamento errado, e o último lançado é o candidato natural; mover leva o
 * que está lá há mais tempo. Os ids chegam na ordem de entrada
 * (`agruparInventario`).
 */
export function idParaMover(grupo: GrupoInventario): string {
  return grupo.ids[0];
}

export function idParaApagar(grupo: GrupoInventario): string {
  return grupo.ids[grupo.ids.length - 1];
}
