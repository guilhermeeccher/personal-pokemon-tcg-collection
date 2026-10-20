/**
 * Living Dex — as etapas de uma tarefa de plano (`dex_tarefa_etapa`).
 * Módulo puro: validação, progresso e reordenação. Quem grava é
 * `lib/db/dex-planejamento.ts`, pela tela e pelo lote de sessão.
 *
 * Uma tarefa como "Missão Safira" é, na prática, uma missão de vários
 * passos; espremida numa frase de descrição, ela não diz onde o usuário
 * parou. A etapa é esse checklist.
 *
 * ## Regras
 *
 *  - **Texto curto, detalhe opcional.** O texto é a linha do checklist (até
 *    200 caracteres, aparado); o detalhe é o "como" (até 2000, várias
 *    linhas, vazio vira nulo). Limites para a tela continuar legível e o
 *    `dex:estado` não virar um dump.
 *  - **No máximo 50 por tarefa.** Uma tarefa com mais que isso é um plano;
 *    quebrar em tarefas mostra melhor o progresso.
 *  - **Só se mexe em etapa de tarefa aberta num plano ativo.** Tarefa feita
 *    ou descartada, e plano fechado, são histórico: mudar o checklist depois
 *    reescreveria o que aconteceu. Reabrir a tarefa (ou o plano) libera.
 *  - **Marcar a última etapa não conclui a tarefa.** A tela avisa que estão
 *    todas feitas, e o clique em "Feita" continua do usuário — é ele quem
 *    sabe se a missão acabou, e concluir oferece o cadastro do Pokémon,
 *    que nunca é automático.
 *  - **Reordenar recebe a lista inteira de ids na ordem nova**, e ela tem de
 *    ser exatamente o conjunto atual: uma lista velha (outra aba acrescentou
 *    ou excluiu uma etapa) é recusada, em vez de perder ou duplicar ordem.
 *
 * Os problemas de leitura saem em inglês, como os de `lerDadosTarefa`:
 * vão para o `dex:aplicar` ou para um corpo que a tela não emite. O que a
 * tela emite de verdade (etapa demais, tarefa fechada, ordem velha) é
 * recusa com chave.
 */
import { recusa, type Recusa } from "./recusa";

export const MAX_ETAPAS_POR_TAREFA = 50;
export const MAX_TEXTO_ETAPA = 200;
export const MAX_DETALHE_ETAPA = 2000;

export interface DadosEtapa {
  texto: string;
  detalhe: string | null;
}

/** Campos que uma edição muda; o que não veio fica como está. */
export interface EdicaoEtapa {
  texto?: string;
  detalhe?: string | null;
  feita?: boolean;
}

function lerTexto(v: unknown, erros: string[]): string | undefined {
  if (typeof v !== "string" || v.trim() === "") {
    erros.push("missing texto");
    return undefined;
  }
  const t = v.trim();
  if (t.length > MAX_TEXTO_ETAPA) {
    erros.push(`texto longer than ${MAX_TEXTO_ETAPA} characters`);
    return undefined;
  }
  return t;
}

function lerDetalhe(v: unknown, erros: string[]): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") {
    erros.push("detalhe must be text");
    return undefined;
  }
  const d = v.trim();
  if (d.length > MAX_DETALHE_ETAPA) {
    erros.push(`detalhe longer than ${MAX_DETALHE_ETAPA} characters`);
    return undefined;
  }
  return d === "" ? null : d;
}

/** Lê uma etapa nova (`{ texto, detalhe? }`). Devolve os dados ou os problemas. */
export function lerDadosEtapa(bruta: unknown): DadosEtapa | string[] {
  if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) return ["a step must be an object"];
  const e = bruta as Record<string, unknown>;
  const erros: string[] = [];
  const texto = lerTexto(e.texto, erros);
  const detalhe = lerDetalhe(e.detalhe, erros);
  if (erros.length > 0 || texto === undefined || detalhe === undefined) return erros;
  return { texto, detalhe };
}

/**
 * Lê uma lista de etapas novas (o `etapas` do lote). Ausente é lista vazia.
 * Os problemas vêm com a posição (`etapas[2]: missing texto`). O limite de
 * 50 é conferido à parte (`recusaSeExcede`), porque depende de quantas a
 * tarefa já tem.
 */
export function lerListaDeEtapas(v: unknown): DadosEtapa[] | string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return ["etapas must be a list"];
  const erros: string[] = [];
  const dados: DadosEtapa[] = [];
  v.forEach((bruta, i) => {
    const r = lerDadosEtapa(bruta);
    if (Array.isArray(r)) erros.push(...r.map((e) => `etapas[${i}]: ${e}`));
    else dados.push(r);
  });
  return erros.length > 0 ? erros : dados;
}

/**
 * Lê uma edição (`{ texto?, detalhe?, feita? }`). Pelo menos um campo; o
 * texto, quando vem, segue as regras de etapa nova; `detalhe` vazio ou
 * `null` apaga o detalhe.
 */
export function lerEdicaoEtapa(bruta: unknown): EdicaoEtapa | string[] {
  if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) return ["the body must be an object"];
  const e = bruta as Record<string, unknown>;
  const erros: string[] = [];
  const edicao: EdicaoEtapa = {};
  if ("texto" in e) {
    const t = lerTexto(e.texto, erros);
    if (t !== undefined) edicao.texto = t;
  }
  if ("detalhe" in e) {
    const d = lerDetalhe(e.detalhe, erros);
    if (d !== undefined) edicao.detalhe = d;
  }
  if ("feita" in e) {
    if (typeof e.feita !== "boolean") erros.push("feita must be true or false");
    else edicao.feita = e.feita;
  }
  if (erros.length > 0) return erros;
  if (Object.keys(edicao).length === 0) return ["nothing to change: send texto, detalhe or feita"];
  return edicao;
}

/** Recusa se `atuais + novas` passa do limite por tarefa. */
export function recusaSeExcede(atuais: number, novas: number): Recusa | null {
  return atuais + novas > MAX_ETAPAS_POR_TAREFA ? recusa("dexEtapasDemais", { maximo: String(MAX_ETAPAS_POR_TAREFA) }) : null;
}

/** Recusa se a tarefa não está aberta num plano ativo (ver as regras no topo). */
export function recusaSeFechada(tarefa: { status: string }, plano: { status: string }): Recusa | null {
  return tarefa.status === "aberta" && plano.status === "ativo" ? null : recusa("dexTarefaFechada");
}

export interface ProgressoEtapas {
  feitas: number;
  total: number;
}

export function progressoEtapas(etapas: readonly { feita: boolean }[]): ProgressoEtapas {
  return { feitas: etapas.filter((e) => e.feita).length, total: etapas.length };
}

/** Todas feitas — e pelo menos uma: tarefa sem etapa não "terminou o checklist". */
export function todasFeitas(etapas: readonly { feita: boolean }[]): boolean {
  return etapas.length > 0 && etapas.every((e) => e.feita);
}

/**
 * Confere a ordem nova pedida contra os ids atuais da tarefa: tem de ser
 * exatamente o mesmo conjunto, sem repetição. Devolve os ids na ordem nova
 * (a posição de cada um é `índice + 1`) ou a recusa.
 */
export function validarNovaOrdem(atuais: readonly string[], pedida: unknown): string[] | Recusa {
  const invalida = recusa("dexOrdemEtapasInvalida");
  if (!Array.isArray(pedida) || !pedida.every((x) => typeof x === "string")) return invalida;
  const ids = pedida as string[];
  const conjunto = new Set(ids);
  if (conjunto.size !== ids.length || ids.length !== atuais.length) return invalida;
  for (const id of atuais) if (!conjunto.has(id)) return invalida;
  return ids;
}

/** Move um id uma posição para cima (`-1`) ou para baixo (`+1`). Fora da borda, devolve a mesma ordem. */
export function moverNaOrdem(ids: readonly string[], id: string, direcao: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const nova = [...ids];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}
