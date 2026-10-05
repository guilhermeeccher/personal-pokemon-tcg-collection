/**
 * As divisões de uma coleção — os recortes com progresso próprio que a tela
 * da coleção e a visão geral mostram (pedido de 2026-10-05: "quantos % de
 * Kanto, de Johto"; "quantos % do set, das secretas, das clássicas").
 *
 * - **Pokédex:** uma divisão por região do escopo (`calcularProgressoPorRegiao`,
 *   reaproveitado — a divisão é o mesmo número com outra roupa).
 * - **Set:** uma divisão por set das vagas, na ordem da receita e depois a
 *   das cartas avulsas (`compararChavesVaga`). Um set **da receita**, numa
 *   coleção com secretas ligadas, se parte em `principal` (até a numeração
 *   oficial) e `secretas` (o que passa dela, e todo número que não é só
 *   dígito: `B`, `TG01`, `SV001`). Set que entrou por carta avulsa não se
 *   parte: ninguém pediu as secretas dele, ele é uma seleção.
 * - **Customizada:** nenhuma. Sem denominador não há percentual.
 *
 * Um set partido em que só uma das partes tem vaga (as secretas todas
 * excluídas, por exemplo) volta a ser uma divisão `inteiro` — "principal
 * 128/128" sozinho seria um rótulo sem contraparte.
 *
 * Módulo puro, sem I/O: quem chama já carregou as vagas e a numeração
 * oficial de cada set.
 */

import { lerChaveVagaSet } from "./chave-vaga-set";
import { type Regiao, regiaoDoNumero } from "./escopo-pokedex";
import type { ParametroSet, TipoColecao } from "./parametro-colecao";
import { calcularProgressoPorRegiao } from "./progresso-regiao";

export type ParteSet = "inteiro" | "principal" | "secretas";

interface ContagemDivisao {
  /** Estável entre leituras — a tela usa como chave de seção. */
  id: string;
  total: number;
  preenchidas: number;
}

export type Divisao =
  | (ContagemDivisao & { tipo: "regiao"; regiao: Regiao })
  | (ContagemDivisao & { tipo: "set"; setId: string; setNome: string; parte: ParteSet });

export interface VagaParaDivisao {
  chave: string;
  preenchida: boolean;
}

export interface EntradaDivisoes {
  tipo: TipoColecao;
  parametro: unknown;
  vagas: readonly VagaParaDivisao[];
  /**
   * `cardCount.official` de cada set (o maior entre as fichas pt e en,
   * como em `contagensDoSet`). Set ausente ou com `0` (promos, a Clássica
   * de 30 anos) não se parte — não há fronteira para medir.
   */
  qtdOficialPorSet: ReadonlyMap<string, number>;
  /** Nome de exibição de cada set; ausente cai no id. */
  nomePorSet?: ReadonlyMap<string, string>;
}

export interface ResultadoDivisoes {
  divisoes: Divisao[];
  /** Chave da vaga → id da divisão em que ela conta. */
  divisaoPorChave: Map<string, string>;
}

export function idDivisaoSet(setId: string, parte: ParteSet): string {
  return parte === "inteiro" ? `set:${setId}` : `set:${setId}:${parte}`;
}

export function idDivisaoRegiao(regiao: Regiao): string {
  return `regiao:${regiao}`;
}

/**
 * Em que parte do set uma carta cai. Só dígitos e até a numeração oficial
 * é principal; o resto é secreta — inclusive número com letra, que nunca
 * entra na contagem oficial.
 */
export function parteDoLocalId(localId: string, qtdOficial: number): "principal" | "secretas" {
  if (!/^\d+$/.test(localId)) return "secretas";
  return Number(localId) <= qtdOficial ? "principal" : "secretas";
}

export function calcularDivisoes(entrada: EntradaDivisoes): ResultadoDivisoes {
  if (entrada.tipo === "pokedex") return divisoesDaPokedex(entrada.vagas);
  if (entrada.tipo === "set") return divisoesDoSet(entrada);
  return { divisoes: [], divisaoPorChave: new Map() };
}

function divisoesDaPokedex(vagas: readonly VagaParaDivisao[]): ResultadoDivisoes {
  const divisaoPorChave = new Map<string, string>();
  for (const v of vagas) {
    const n = Number(v.chave);
    if (Number.isInteger(n)) divisaoPorChave.set(v.chave, idDivisaoRegiao(regiaoDoNumero(n)));
  }
  const divisoes = calcularProgressoPorRegiao(vagas).map(
    (p): Divisao => ({ id: idDivisaoRegiao(p.regiao), tipo: "regiao", ...p }),
  );
  return { divisoes, divisaoPorChave };
}

function divisoesDoSet(entrada: EntradaDivisoes): ResultadoDivisoes {
  const parametro = (entrada.parametro ?? {}) as Partial<ParametroSet>;
  const receita = parametro.sets ?? [];
  const secretasLigadas = parametro.incluirSecretas === true;

  // Primeiro passo: cada vaga numa parte provisória do seu set.
  const porSet = new Map<string, { chave: string; preenchida: boolean; parte: ParteSet }[]>();
  for (const v of entrada.vagas) {
    const lida = lerChaveVagaSet(v.chave);
    if (!lida) continue;
    const oficial = entrada.qtdOficialPorSet.get(lida.setId) ?? 0;
    const parte: ParteSet =
      secretasLigadas && receita.includes(lida.setId) && oficial > 0
        ? parteDoLocalId(lida.localId, oficial)
        : "inteiro";
    const lista = porSet.get(lida.setId) ?? [];
    lista.push({ chave: v.chave, preenchida: v.preenchida, parte });
    porSet.set(lida.setId, lista);
  }

  // A ordem dos sets é a mesma da grade (`compararChavesVaga`): receita,
  // depois os avulsos em ordem alfabética.
  const posicao = (setId: string) => {
    const i = receita.indexOf(setId);
    return i === -1 ? receita.length : i;
  };
  const ordemSets = [...porSet.keys()].sort(
    (a, b) => posicao(a) - posicao(b) || a.localeCompare(b),
  );

  const divisoes: Divisao[] = [];
  const divisaoPorChave = new Map<string, string>();
  for (const setId of ordemSets) {
    const vagas = porSet.get(setId)!;
    const partesPresentes = new Set(vagas.map((v) => v.parte));
    // Segundo passo: set partido com uma parte só volta a ser inteiro.
    const partir = partesPresentes.has("principal") && partesPresentes.has("secretas");
    const partes: ParteSet[] = partir ? ["principal", "secretas"] : ["inteiro"];
    for (const parte of partes) {
      const daParte = partir ? vagas.filter((v) => v.parte === parte) : vagas;
      const id = idDivisaoSet(setId, parte);
      for (const v of daParte) divisaoPorChave.set(v.chave, id);
      divisoes.push({
        id,
        tipo: "set",
        setId,
        setNome: entrada.nomePorSet?.get(setId) ?? setId,
        parte,
        total: daParte.length,
        preenchidas: daParte.filter((v) => v.preenchida).length,
      });
    }
  }
  return { divisoes, divisaoPorChave };
}

export interface DivisaoQuaseLa {
  colecaoId: string;
  divisao: Divisao;
  faltam: number;
}

/**
 * "Quase lá" da visão geral: as divisões mais perto de fechar, entre todas
 * as coleções. Só entra divisão já começada (ao menos uma vaga preenchida) e
 * ainda aberta: uma divisão em 0% não está "quase", e uma em 100% já fechou.
 * Ordem por percentual, depois por quantas faltam — 84% com 20 faltando vem
 * antes de 76% com 31.
 */
export function selecionarQuaseLa(
  colecoes: readonly { id: string; divisoes: readonly Divisao[] }[],
  limite: number,
): DivisaoQuaseLa[] {
  const candidatas: DivisaoQuaseLa[] = [];
  for (const c of colecoes) {
    for (const d of c.divisoes) {
      const faltam = d.total - d.preenchidas;
      if (d.preenchidas > 0 && faltam > 0) candidatas.push({ colecaoId: c.id, divisao: d, faltam });
    }
  }
  candidatas.sort((a, b) => {
    const pa = a.divisao.preenchidas / a.divisao.total;
    const pb = b.divisao.preenchidas / b.divisao.total;
    return pb - pa || a.faltam - b.faltam;
  });
  return candidatas.slice(0, limite);
}
