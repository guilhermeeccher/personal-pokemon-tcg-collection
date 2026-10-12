/**
 * Living Dex — o lote de uma sessão de planejamento (`pnpm dex:aplicar`).
 * Módulo puro: lê o JSON, valida contra o que o banco sabe e devolve os
 * passos a gravar. Quem grava é `lib/db/dex-sessao.ts`, numa transação.
 *
 * Numa sessão, o Claude e o usuário pesquisam juntos o caminho para um
 * troféu ou um Pokémon; o que sai dela entra por aqui: troféus conquistados,
 * planos com tarefas, mudança de status de tarefa e de plano, e Pokémon que
 * o usuário disse ter pegado. Tudo entra com `origem = sessao`.
 *
 * ## Contrato
 *
 *  - **Todo lote tem `ref`, e todo item que cria algo também.** Ref já
 *    aplicada é pulada, não duplicada: reaplicar o mesmo lote não muda
 *    nada, e um lote corrigido pode repetir os itens que já entraram.
 *  - **Um item inválido recusa o lote inteiro.** Os erros vêm todos juntos.
 *  - **Um lote pode apontar para o que um anterior criou** pela `ref`
 *    (`planoRef`, `tarefaRef`), ou para o que a tela criou pelo id.
 *  - **Registro de Pokémon só nasce no jogo**, pelas mesmas regras do
 *    cadastro por jogo (`expandirLoteCadastro`), e só com forma que existe
 *    no catálogo daquele jogo. A tela deixa "Mostrar todas"; o lote não,
 *    porque ali uma forma fora do jogo é erro de digitação, não um Pokémon
 *    que veio de troca. Mover para o HOME não entra
 *    no lote: sair de um jogo que só envia pede a confirmação do usuário na
 *    tela, e essa confirmação nunca é automática.
 */
import { ehJogoDex } from "./dex-jogos";
import { expandirLoteCadastro, lerLoteCadastro, type ContextoRegistroDex, type DadosRegistroDex } from "./dex-registro";
import { JOGO_HOME } from "./dex-trofeus";

export const TIPOS_TAREFA = ["captura", "evolucao", "troca", "progresso", "transferencia", "outro"] as const;
export type TipoTarefaDex = (typeof TIPOS_TAREFA)[number];
export const STATUS_TAREFA = ["aberta", "feita", "descartada"] as const;
export type StatusTarefaDex = (typeof STATUS_TAREFA)[number];
export const STATUS_PLANO = ["ativo", "concluido", "encerrado"] as const;
export type StatusPlanoDex = (typeof STATUS_PLANO)[number];

export interface DadosTarefa {
  titulo: string;
  descricao: string | null;
  tipo: TipoTarefaDex;
  jogoId: string | null;
  formaIds: string[];
  trofeuId: string | null;
}

export interface DadosPlano {
  titulo: string;
  objetivo: string | null;
  inicio: string;
  fim: string | null;
  trofeuIds: string[];
}

/** Para quem o passo aponta: algo criado por uma ref (deste lote ou de outro) ou um id do banco. */
export type Alvo = { ref: string } | { id: string };

export type PassoSessao =
  | { tipo: "trofeu"; ref: string; trofeuId: string; obtidoEm: string; notas: string | null }
  | { tipo: "plano"; ref: string; dados: DadosPlano }
  | { tipo: "tarefa"; ref: string; plano: Alvo; dados: DadosTarefa }
  | { tipo: "status-tarefa"; tarefa: Alvo; status: StatusTarefaDex }
  | { tipo: "status-plano"; plano: Alvo; status: StatusPlanoDex }
  | { tipo: "registros"; ref: string; jogoId: string; registros: DadosRegistroDex[] };

export interface ContextoSessao {
  /** Troféus ativos: id → jogo. */
  trofeus: ReadonlyMap<string, string>;
  /** Troféus já conquistados. */
  obtidos: ReadonlySet<string>;
  /** Refs já gravadas por lotes anteriores: ref → tipo. */
  refs: ReadonlyMap<string, string>;
  planos: ReadonlySet<string>;
  tarefas: ReadonlySet<string>;
  registro: ContextoRegistroDex;
  /** Formas que existem no jogo (`catalogoDoJogo`); `null` = jogo sem catálogo. */
  formasDoJogo: (jogoId: string) => ReadonlySet<string> | null;
}

export type ResultadoPlanejamento =
  | { ok: true; loteJaAplicado: boolean; passos: PassoSessao[]; pulados: string[] }
  | { ok: false; erros: string[] };

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
function dataValida(v: unknown): v is string {
  if (typeof v !== "string" || !DATA_ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const texto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const opcional = (v: unknown): string | null => (texto(v) ? v.trim() : null);
const listaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Lê e valida o lote. `hoje` (`YYYY-MM-DD`) é a data de um troféu sem data:
 * o dia da sessão.
 */
export function planejarLote(json: unknown, ctx: ContextoSessao, hoje: string): ResultadoPlanejamento {
  const erros: string[] = [];
  const lote = (json ?? {}) as Record<string, unknown>;
  if (!texto(lote.ref)) return { ok: false, erros: ["the batch needs a ref"] };
  if (ctx.refs.has(lote.ref)) return { ok: true, loteJaAplicado: true, passos: [], pulados: [] };

  const passos: PassoSessao[] = [];
  const pulados: string[] = [];
  /** Refs criadas neste lote, com o tipo, para as referências internas. */
  const novas = new Map<string, string>();

  /** A ref do item é nova? Repetida no lote é erro; já aplicada é pulada. */
  function refNova(ref: unknown, tipo: string, onde: string): ref is string {
    if (!texto(ref)) {
      erros.push(`${onde}: missing ref`);
      return false;
    }
    if (novas.has(ref) || ref === lote.ref) {
      erros.push(`${onde}: ref "${ref}" repeated in this batch`);
      return false;
    }
    novas.set(ref, tipo);
    if (ctx.refs.has(ref)) {
      pulados.push(`${ref} (already applied)`);
      return false;
    }
    return true;
  }

  function alvo(item: Record<string, unknown>, tipo: "plano" | "tarefa", onde: string): Alvo | null {
    const ref = item[`${tipo}Ref`];
    const id = item[`${tipo}Id`];
    if (texto(ref)) {
      const t = novas.get(ref) ?? ctx.refs.get(ref);
      if (t !== tipo) {
        erros.push(`${onde}: ${tipo}Ref "${ref}" is not a ${tipo} created by a session`);
        return null;
      }
      return { ref };
    }
    if (texto(id)) {
      if (!(tipo === "plano" ? ctx.planos : ctx.tarefas).has(id)) {
        erros.push(`${onde}: ${tipo}Id "${id}" does not exist`);
        return null;
      }
      return { id };
    }
    erros.push(`${onde}: needs ${tipo}Ref or ${tipo}Id`);
    return null;
  }

  function trofeuValido(id: string, onde: string): boolean {
    if (ctx.trofeus.has(id)) return true;
    erros.push(`${onde}: unknown trophy "${id}"`);
    return false;
  }

  function lerTarefa(t: Record<string, unknown>, onde: string): DadosTarefa | null {
    const r = lerDadosTarefa(t, ctx.trofeus, ctx.registro.formasAtivas);
    if (Array.isArray(r)) {
      erros.push(...r.map((e) => `${onde}: ${e}`));
      return null;
    }
    return r;
  }

  const lista = (campo: string): Record<string, unknown>[] => {
    const v = lote[campo];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      erros.push(`${campo} must be a list`);
      return [];
    }
    return v.map((x) => (x ?? {}) as Record<string, unknown>);
  };

  lista("trofeus").forEach((t, i) => {
    const onde = `trofeus[${i}]`;
    if (!texto(t.trofeuId) || !trofeuValido(t.trofeuId, onde)) {
      if (!texto(t.trofeuId)) erros.push(`${onde}: missing trofeuId`);
      return;
    }
    if (ctx.trofeus.get(t.trofeuId) === JOGO_HOME) {
      erros.push(`${onde}: "${t.trofeuId}" is a HOME trophy; it counts from the records and is never marked`);
      return;
    }
    if (t.obtidoEm !== undefined && !dataValida(t.obtidoEm)) erros.push(`${onde}: obtidoEm must be YYYY-MM-DD`);
    if (!refNova(t.ref, "trofeu", onde)) return;
    if (ctx.obtidos.has(t.trofeuId)) {
      pulados.push(`${t.ref} (${t.trofeuId} already earned)`);
      return;
    }
    passos.push({
      tipo: "trofeu",
      ref: t.ref,
      trofeuId: t.trofeuId,
      obtidoEm: dataValida(t.obtidoEm) ? t.obtidoEm : hoje,
      notas: opcional(t.notas),
    });
  });

  lista("planos").forEach((p, i) => {
    const onde = `planos[${i}]`;
    const dadosPlano = lerDadosPlano(p, ctx.trofeus);
    if (Array.isArray(dadosPlano)) erros.push(...dadosPlano.map((e) => `${onde}: ${e}`));
    const tarefas = p.tarefas ?? [];
    if (!Array.isArray(tarefas)) erros.push(`${onde}: tarefas must be a list`);

    const criar = refNova(p.ref, "plano", onde);
    if (criar && !Array.isArray(dadosPlano)) passos.push({ tipo: "plano", ref: p.ref as string, dados: dadosPlano });
    if (!Array.isArray(tarefas) || !texto(p.ref)) return;
    tarefas.forEach((bruta, j) => {
      const t = (bruta ?? {}) as Record<string, unknown>;
      const ondeT = `${onde}.tarefas[${j}]`;
      const dados = lerTarefa(t, ondeT);
      if (refNova(t.ref, "tarefa", ondeT) && dados) {
        passos.push({ tipo: "tarefa", ref: t.ref as string, plano: { ref: p.ref as string }, dados });
      }
    });
  });

  lista("tarefas").forEach((t, i) => {
    const onde = `tarefas[${i}]`;
    const plano = alvo(t, "plano", onde);
    const dados = lerTarefa(t, onde);
    if (refNova(t.ref, "tarefa", onde) && plano && dados) {
      passos.push({ tipo: "tarefa", ref: t.ref as string, plano, dados });
    }
  });

  lista("status").forEach((s, i) => {
    const onde = `status[${i}]`;
    if ("tarefaRef" in s || "tarefaId" in s) {
      const a = alvo(s, "tarefa", onde);
      if (!STATUS_TAREFA.includes(s.status as StatusTarefaDex)) erros.push(`${onde}: task status must be one of ${STATUS_TAREFA.join(", ")}`);
      else if (a) passos.push({ tipo: "status-tarefa", tarefa: a, status: s.status as StatusTarefaDex });
    } else {
      const a = alvo(s, "plano", onde);
      if (!STATUS_PLANO.includes(s.status as StatusPlanoDex)) erros.push(`${onde}: plan status must be one of ${STATUS_PLANO.join(", ")}`);
      else if (a) passos.push({ tipo: "status-plano", plano: a, status: s.status as StatusPlanoDex });
    }
  });

  lista("registros").forEach((r, i) => {
    const onde = `registros[${i}]`;
    const lido = lerLoteCadastro(r);
    if (typeof lido === "string") {
      erros.push(`${onde}: ${lido}`);
      return;
    }
    const doJogo = ctx.formasDoJogo(lido.jogoId);
    const fora = doJogo ? lido.itens.filter((it) => !doJogo.has(it.formaId)).map((it) => it.formaId) : [];
    if (fora.length > 0) {
      erros.push(`${onde}: not in ${lido.jogoId}'s catalog: ${fora.join(", ")}`);
      return;
    }
    const expandido = expandirLoteCadastro(lido, ctx.registro);
    if (!expandido.ok) {
      for (const rec of expandido.recusas) erros.push(`${onde}: ${rec.chave} ${JSON.stringify(rec.valores ?? {})}`);
      return;
    }
    if (refNova(r.ref, "registros", onde)) {
      passos.push({ tipo: "registros", ref: r.ref as string, jogoId: lido.jogoId, registros: expandido.registros });
    }
  });

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, loteJaAplicado: false, passos, pulados };
}

/**
 * Lê os dados de uma tarefa (do lote ou da tela). Devolve os dados ou a
 * lista de problemas.
 */
export function lerDadosTarefa(
  t: Record<string, unknown>,
  trofeus: ReadonlyMap<string, string>,
  formasAtivas: ReadonlySet<string>,
): DadosTarefa | string[] {
  const erros: string[] = [];
  if (!texto(t.titulo)) erros.push("missing titulo");
  if (!TIPOS_TAREFA.includes(t.tipo as TipoTarefaDex)) erros.push(`tipo must be one of ${TIPOS_TAREFA.join(", ")}`);
  if (t.jogoId != null && !ehJogoDex(t.jogoId)) erros.push(`unknown game "${String(t.jogoId)}"`);
  const formaIds = t.formaIds ?? [];
  if (!listaDeTexto(formaIds)) erros.push("formaIds must be a list of slot ids");
  else for (const f of formaIds) if (!formasAtivas.has(f)) erros.push(`unknown slot "${f}"`);
  if (t.trofeuId != null && (typeof t.trofeuId !== "string" || !trofeus.has(t.trofeuId))) {
    erros.push(`unknown trophy "${String(t.trofeuId)}"`);
  }
  if (erros.length > 0) return erros;
  return {
    titulo: (t.titulo as string).trim(),
    descricao: opcional(t.descricao),
    tipo: t.tipo as TipoTarefaDex,
    jogoId: (t.jogoId as string | undefined) ?? null,
    formaIds: formaIds as string[],
    trofeuId: (t.trofeuId as string | undefined) ?? null,
  };
}

/** Lê os dados de um plano (do lote ou da tela). */
export function lerDadosPlano(p: Record<string, unknown>, trofeus: ReadonlyMap<string, string>): DadosPlano | string[] {
  const erros: string[] = [];
  if (!texto(p.titulo)) erros.push("missing titulo");
  if (!dataValida(p.inicio)) erros.push("inicio must be YYYY-MM-DD");
  if (p.fim != null && p.fim !== "" && !dataValida(p.fim)) erros.push("fim must be YYYY-MM-DD");
  if (dataValida(p.inicio) && dataValida(p.fim) && p.fim < p.inicio) erros.push("fim before inicio");
  const trofeuIds = p.trofeuIds ?? [];
  if (!listaDeTexto(trofeuIds)) erros.push("trofeuIds must be a list");
  else for (const id of trofeuIds) if (!trofeus.has(id)) erros.push(`unknown trophy "${id}"`);
  if (erros.length > 0) return erros;
  return {
    titulo: (p.titulo as string).trim(),
    objetivo: opcional(p.objetivo),
    inicio: p.inicio as string,
    fim: dataValida(p.fim) ? p.fim : null,
    trofeuIds: trofeuIds as string[],
  };
}
