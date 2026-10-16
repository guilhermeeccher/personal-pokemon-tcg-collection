/**
 * Living Dex — Recebidos: os Pokémon que chegaram ao HOME e o usuário ainda
 * não levou para a caixa deles, agrupados pela caixa de destino. Módulo puro.
 *
 * ## Por que existe (D9, 2026-10-12)
 *
 * O HOME põe o que chega dos jogos numa caixa só, e o usuário arruma depois,
 * um a um, pelas posições das caixas (`dex-caixas.ts`). Com dezenas de
 * Pokémon por rodada, saber onde cada um vai pedia abrir a Pokédex para cada
 * um. Aqui a rodada aparece de uma vez, já separada por caixa.
 *
 * ## "A guardar" é estado gravado, não derivado
 *
 * Diferente do estado da vaga, isto não sai dos registros: o sistema não
 * sabe quando o usuário arrumou o HOME, e a data de atualização do registro
 * muda também numa correção. Por isso `dex_registro.a_guardar`:
 *
 * - **liga quando o Pokémon chega ao HOME** — enviado de um jogo, ou
 *   cadastrado direto no HOME (D8);
 * - **desliga quando o usuário diz que guardou** (por caixa ou tudo), ou
 *   quando o Pokémon sai do HOME;
 * - mover para onde já está não é chegada, e não mexe nele.
 *
 * ## Uma vaga, um Pokémon
 *
 * A posição é da vaga, não do Pokémon. Se a vaga já tem um Pokémon guardado,
 * ou outro desta rodada chegou antes (ordem de cadastro), o seguinte é cópia
 * **extra**: não tem lugar nas caixas, e a tela o põe à parte em vez de
 * apontar uma posição que já tem dono. O mesmo para o que está **fora** das
 * caixas: seção desligada, ou shiny de forma sem shiny — esse tem lugar no
 * mapa, mas como buraco (`dex-caixas.ts`), onde nada se guarda.
 */
import { montarCaixasDex, posicoesNasCaixas, type CaixaDex, type FormaParaCaixa } from "./dex-caixas";
import type { TrilhaDex } from "./dex-grade";
import { LOCAL_HOME } from "./dex-jogos";
import type { SecoesContadas } from "./dex-secoes";

/** Um registro criado neste local já nasce "a guardar"? Só no HOME. */
export function aGuardarNaCriacao(local: string): boolean {
  return local === LOCAL_HOME;
}

/**
 * Como fica o "a guardar" depois de um movimento. `null` = não muda: mover
 * para onde já está não é chegada.
 */
export function aGuardarDepoisDoMovimento(localAtual: string, novoLocal: string): boolean | null {
  if (localAtual === novoLocal) return null;
  return novoLocal === LOCAL_HOME;
}

export interface RegistroParaRecebidos {
  id: string;
  formaId: string;
  shiny: boolean;
  local: string;
  aGuardar: boolean;
}

export interface CaixaRecebidos<T extends FormaParaCaixa, R extends RegistroParaRecebidos> {
  trilha: TrilhaDex;
  caixa: CaixaDex<T>;
  /** Os desta rodada que vão para esta caixa, na ordem das posições (1 a 30). */
  itens: { registro: R; posicao: number }[];
  /** Vagas da caixa que já têm um Pokémon guardado: a tela as mostra para orientar. */
  jaGuardadas: ReadonlySet<string>;
}

export type MotivoSemLugar = "extra" | "fora";

export interface Recebidos<T extends FormaParaCaixa, R extends RegistroParaRecebidos> {
  /** Normal antes de shiny; em cada trilha, na ordem das caixas. */
  caixas: CaixaRecebidos<T, R>[];
  semLugar: { registro: R; motivo: MotivoSemLugar }[];
  /** Todos os ids "a guardar" no HOME, com e sem lugar: o "Guardei tudo". */
  ids: string[];
}

const TRILHAS: readonly TrilhaDex[] = ["normal", "shiny"];

/**
 * Os Pokémon "a guardar" no HOME, por caixa de destino. `registros` na ordem
 * de cadastro: quem chegou antes fica com a vaga, o resto é extra.
 */
export function montarRecebidos<T extends FormaParaCaixa, R extends RegistroParaRecebidos>(
  formas: readonly T[],
  registros: readonly R[],
  secoes: SecoesContadas,
  reservadas: number,
): Recebidos<T, R> {
  const noHome = registros.filter((r) => r.local === LOCAL_HOME);
  const pendentes = noHome.filter((r) => r.aGuardar);
  const caixas: CaixaRecebidos<T, R>[] = [];
  const semLugar: Recebidos<T, R>["semLugar"] = [];

  for (const trilha of TRILHAS) {
    const shiny = trilha === "shiny";
    const daTrilha = pendentes.filter((r) => r.shiny === shiny);
    if (daTrilha.length === 0) continue;

    const guardadas = new Set(noHome.filter((r) => r.shiny === shiny && !r.aGuardar).map((r) => r.formaId));
    const caixasDaTrilha = montarCaixasDex(formas, trilha, secoes, reservadas);
    const caixaPorNumero = new Map(caixasDaTrilha.map((c) => [c.numero, c]));
    /* Só vaga de verdade: buraco (shiny de forma sem shiny) não é lugar. */
    const posicoes = posicoesNasCaixas(caixasDaTrilha);

    const porCaixa = new Map<number, CaixaRecebidos<T, R>>();
    const tomadas = new Set<string>();
    for (const registro of daTrilha) {
      const p = posicoes.get(registro.formaId);
      const l = p && { caixa: caixaPorNumero.get(p.caixa)!, posicao: p.posicao };
      if (!l) {
        semLugar.push({ registro, motivo: "fora" });
        continue;
      }
      if (guardadas.has(registro.formaId) || tomadas.has(registro.formaId)) {
        semLugar.push({ registro, motivo: "extra" });
        continue;
      }
      tomadas.add(registro.formaId);
      let grupo = porCaixa.get(l.caixa.numero);
      if (!grupo) {
        grupo = {
          trilha,
          caixa: l.caixa,
          itens: [],
          jaGuardadas: new Set(l.caixa.lugares.filter((x) => guardadas.has(x.forma.id)).map((x) => x.forma.id)),
        };
        porCaixa.set(l.caixa.numero, grupo);
      }
      grupo.itens.push({ registro, posicao: l.posicao });
    }
    for (const grupo of [...porCaixa.values()].sort((a, b) => a.caixa.numero - b.caixa.numero)) {
      grupo.itens.sort((a, b) => a.posicao - b.posicao);
      caixas.push(grupo);
    }
  }

  return { caixas, semLugar, ids: pendentes.map((r) => r.id) };
}
