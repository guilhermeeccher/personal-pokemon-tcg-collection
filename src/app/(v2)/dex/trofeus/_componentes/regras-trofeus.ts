/**
 * O que a tela de troféus da v2 decide, sem pele, para o teste cobrir sem
 * navegador. As contas (progresso, platina) são as de
 * `lib/dominio/dex-trofeus.ts`, as mesmas da v1; aqui só o que é da tela:
 * quais abas existem, qual abre, o que aparece com "só o que falta" e que
 * botões cada troféu oferece.
 */
import { JOGO_HOME } from "@/lib/dominio/dex-trofeus";
import type { JogoPossuidoDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

export interface AbaTrofeus {
  jogoId: string;
  nome: string;
}

/**
 * As abas, como na v1: o HOME primeiro (quando o arquivo tem troféus dele) e
 * os jogos da pessoa que têm troféus, na ordem em que ela os tem. Jogo parado
 * continua: os troféus dele são história, e marcar um não grava registro.
 */
export function abasDeTrofeus(
  jogos: readonly Pick<JogoPossuidoDTO, "jogoId" | "nome">[],
  trofeus: readonly Pick<TrofeuDexDTO, "jogoId">[],
): AbaTrofeus[] {
  const comTrofeu = new Set(trofeus.map((t) => t.jogoId));
  return [
    ...(comTrofeu.has(JOGO_HOME) ? [{ jogoId: JOGO_HOME, nome: "Pokémon HOME" }] : []),
    ...jogos.filter((j) => comTrofeu.has(j.jogoId)).map((j) => ({ jogoId: j.jogoId, nome: j.nome })),
  ];
}

/** O jogo que abre: o do `?jogo=` quando é uma das abas, senão a primeira (o HOME). */
export function jogoQueAbre(abas: readonly AbaTrofeus[], pedido: string): string {
  return abas.some((a) => a.jogoId === pedido) ? pedido : (abas[0]?.jogoId ?? "");
}

/** "Só o que falta" esconde o conquistado; a ordem continua a do arquivo (a da história). */
export function trofeusVisiveis<T extends Pick<TrofeuDexDTO, "jogoId" | "obtido">>(
  trofeus: readonly T[],
  jogoId: string,
  soFalta: boolean,
): T[] {
  return trofeus.filter((t) => t.jogoId === jogoId && !(soFalta && t.obtido));
}

export type AcaoTrofeu = "conquistei" | "desfazer" | "cacar";

/**
 * Os botões de um troféu. **O do HOME nunca se marca nem se desmarca**: vale
 * pelos registros, e a rota recusa (`dexTrofeuCalculado`) — a tela não
 * oferece. Conquistado oferece só desfazer; o que falta, marcar e "Caçar"
 * (um plano com ele como alvo).
 */
export function acoesDoTrofeu(t: Pick<TrofeuDexDTO, "tipo" | "obtido">): AcaoTrofeu[] {
  if (t.tipo === "calculado") return t.obtido ? [] : ["cacar"];
  return t.obtido ? ["desfazer"] : ["conquistei", "cacar"];
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A data da conquista vem do campo de data: vazio ou fora do formato não sai da tela. */
export function dataDeConquistaValida(data: string): boolean {
  if (!DATA_ISO.test(data)) return false;
  const [a, m, d] = data.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  return dia.getUTCFullYear() === a && dia.getUTCMonth() === m - 1 && dia.getUTCDate() === d;
}
