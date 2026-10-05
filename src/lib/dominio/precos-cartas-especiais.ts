/**
 * Preço das cartas especiais — quais cartas entram na consulta à LigaPokemon,
 * como a linha certa é reconhecida e como o resultado se ordena. Módulo puro:
 * não faz requisição, não toca banco.
 *
 * ## Por que só as especiais
 *
 * No ritmo que o `robots.txt` deles pede (~6 min por requisição), consultar o
 * inventário inteiro levaria semanas; o valor da coleção está nas cartas
 * holo/secretas, e é por elas que se pergunta. Hoje são ~63 cartas.
 *
 * ## A regra de seleção
 *
 * Carta de catálogo **possuída** (qualquer cópia, alocada ou livre) cuja
 * classe de raridade (`classificarRaridade`) é `holo` ou `secreta` — **mais**
 * toda carta do set `30th-c`, as clássicas da Celebração de 30 Anos: o
 * upstream grava a raridade delas como o texto literal "None", que cai em
 * `comum`, e ficariam de fora justamente sendo as mais valiosas do conjunto.
 *
 * ## Uma consulta por carta física
 *
 * As linhas pt e en do mesmo `carta_id` são a mesma carta física (regra 7):
 * a Liga é consultada uma vez só, e o preço é gravado por `carta_id`. O termo
 * de busca é o nome em inglês — como a lista deles escreve — e o nome em
 * português entra como segunda tentativa, igual à vaga de set.
 */

import type { LinhaBuscaLiga } from "./liga-busca";
import { separarPorFrescor } from "./frescor-consulta";
import { linhaCasaComVagaSet } from "./liga-set";
import { ordenarPorDestaque } from "./destaque-carta";
import { classificarRaridade } from "./raridade-visual";

/** Set cujas cartas entram sempre, qualquer que seja a raridade gravada. */
export const SET_CLASSICAS_30_ANOS = "30th-c";

/** Uma linha de `carta_catalogo` de uma carta possuída. */
export interface LinhaCatalogoParaPreco {
  cartaId: string;
  idioma: "pt" | "en" | "jp";
  nome: string;
  setId: string;
  setNome: string;
  setSigla: string | null;
  localId: string;
  raridade: string | null;
}

export interface CartaParaPreco {
  /** Chave da consulta: o `carta_id`, igual nas linhas pt e en. */
  chave: string;
  cartaId: string;
  /** Nome para exibição: pt quando existe, senão en, senão o que houver. */
  nome: string;
  /** Termo da primeira busca: o nome em inglês, quando o catálogo o tem. */
  nomeBusca: string;
  /** Segunda tentativa, só quando o nome em outro idioma é diferente. */
  nomeAlternativo: string | null;
  setId: string;
  setNome: string;
  setSigla: string | null;
  localId: string;
  raridade: string | null;
}

export function ehCartaEspecial(carta: { setId: string; raridade: string | null }): boolean {
  if (carta.setId.toLowerCase() === SET_CLASSICAS_30_ANOS) return true;
  const classe = classificarRaridade(carta.raridade);
  return classe === "holo" || classe === "secreta";
}

const ORDEM_EXIBICAO = ["pt", "en", "jp"] as const;

/**
 * Recebe as linhas de catálogo das cartas possuídas (e, de preferência, as
 * linhas en/pt das mesmas cartas, para o termo de busca) e devolve uma carta
 * por `carta_id`, só das especiais, na ordem do catálogo (set, número).
 *
 * A elegibilidade olha **todas** as linhas do `carta_id`: a raridade de uma
 * carta física não muda com o idioma da ficha, e uma ficha sem texto de
 * raridade não pode tirar a carta da lista.
 */
export function selecionarCartasParaPreco(
  linhas: readonly LinhaCatalogoParaPreco[],
): CartaParaPreco[] {
  const porCarta = new Map<string, LinhaCatalogoParaPreco[]>();
  for (const l of linhas) {
    const lista = porCarta.get(l.cartaId);
    if (lista) lista.push(l);
    else porCarta.set(l.cartaId, [l]);
  }

  const cartas: CartaParaPreco[] = [];
  for (const [cartaId, grupo] of porCarta) {
    if (!grupo.some(ehCartaEspecial)) continue;

    const ordenado = [...grupo].sort(
      (a, b) => ORDEM_EXIBICAO.indexOf(a.idioma) - ORDEM_EXIBICAO.indexOf(b.idioma),
    );
    const exibicao = ordenado[0];
    const emIngles = grupo.find((l) => l.idioma === "en");
    const nomeBusca = emIngles?.nome ?? exibicao.nome;
    const alternativa = ordenado.find((l) => l.nome !== nomeBusca);

    cartas.push({
      chave: cartaId,
      cartaId,
      nome: exibicao.nome,
      nomeBusca,
      nomeAlternativo: alternativa ? alternativa.nome : null,
      setId: exibicao.setId,
      setNome: exibicao.setNome,
      setSigla: exibicao.setSigla,
      localId: exibicao.localId,
      raridade: exibicao.raridade,
    });
  }

  return cartas.sort(
    (a, b) =>
      a.setId.localeCompare(b.setId) ||
      a.localId.localeCompare(b.localId, "en", { numeric: true }) ||
      a.cartaId.localeCompare(b.cartaId),
  );
}

/**
 * A linha da Liga que é esta carta: mesma edição e mesmo número, pela mesma
 * regra da vaga de set (inclusive a identidade das clássicas de 30 Anos).
 * Com mais de uma, fica a de menor preço — a busca já vem do mais barato —
 * e linha sem preço (ninguém vende) não conta como achada.
 */
export function escolherLinhaDePreco(
  linhas: readonly LinhaBuscaLiga[],
  carta: Pick<CartaParaPreco, "localId" | "setId" | "setSigla">,
  setPorEdid: ReadonlyMap<number, string> = new Map(),
): LinhaBuscaLiga | null {
  const alvo = { numero: carta.localId, setId: carta.setId, setSigla: carta.setSigla };
  const casadas = linhas.filter(
    (l) => l.preco !== null && linhaCasaComVagaSet(l, alvo, setPorEdid),
  );
  if (casadas.length === 0) return null;
  return casadas.reduce((a, b) => ((b.preco as number) < (a.preco as number) ? b : a));
}

/** O que a consulta anterior guardou de uma carta. */
export interface ConsultaDePreco {
  consultadoEm: Date;
  encontrada: boolean;
  /** Teto de páginas com que a busca rodou. */
  paginasMax: number;
}

/**
 * Separa as cartas que a rodada vai consultar das que já têm resposta fresca
 * (24 h, como `frescor-consulta.ts`) — achada ou não.
 *
 * **"Não achada" só vale como resposta para o teto de páginas com que foi
 * perguntada.** Com a busca limitada a N páginas, "não achei" significa "não
 * está nas N mais baratas"; se o teto subiu desde então, essa resposta é
 * velha e a carta é perguntada de novo. Achada nunca depende do teto.
 */
export function separarCartasPorFrescor<T extends { chave: string }>(
  cartas: readonly T[],
  consultas: ReadonlyMap<string, ConsultaDePreco>,
  { agora, validadeHoras, maxPaginas }: { agora: Date; validadeHoras: number; maxPaginas: number },
): { pendentes: T[]; puladas: T[] } {
  const validas = new Map<string, Date>();
  for (const [chave, c] of consultas) {
    if (c.encontrada || c.paginasMax >= maxPaginas) validas.set(chave, c.consultadoEm);
  }
  return separarPorFrescor(cartas, validas, { agora, validadeHoras });
}

export interface PrecoDeCarta {
  encontrada: boolean;
  preco: number | null;
  precoMedio: number | null;
  precoMaximo: number | null;
}

/** O valor que ordena e soma: o preço médio; sem ele, o menor. */
export function valorDaCarta(p: Pick<PrecoDeCarta, "preco" | "precoMedio">): number | null {
  return p.precoMedio ?? p.preco;
}

/** Decrescente por valor; carta sem valor (não achada) vai para o fim. */
export function compararPorValorDesc(
  a: Pick<PrecoDeCarta, "preco" | "precoMedio">,
  b: Pick<PrecoDeCarta, "preco" | "precoMedio">,
): number {
  const va = valorDaCarta(a);
  const vb = valorDaCarta(b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  return vb - va;
}

export interface ResumoDePrecos {
  cartasComPreco: number;
  naoEncontradas: number;
  /** Soma dos preços médios (ou mínimos, sem média) das cartas com preço. */
  somaMedios: number;
}

export function resumirPrecos(precos: readonly PrecoDeCarta[]): ResumoDePrecos {
  let cartasComPreco = 0;
  let naoEncontradas = 0;
  let soma = 0;
  for (const p of precos) {
    const v = p.encontrada ? valorDaCarta(p) : null;
    if (v === null) {
      naoEncontradas++;
    } else {
      cartasComPreco++;
      soma += v;
    }
  }
  // Centavos: evita 0.1 + 0.2 aparecer como 0,30000000000000004 em tela.
  return { cartasComPreco, naoEncontradas, somaMedios: Math.round(soma * 100) / 100 };
}

/**
 * A ordem das joias da visão geral: primeiro as que têm preço guardado, do
 * valor maior para o menor; depois as sem preço, pela vitrine
 * (`ordenarPorDestaque`). Preço real é o melhor critério de "o que vale
 * mais", mas só existe para as cartas já consultadas — o resto continua
 * ordenado por aparência em vez de sumir ou de ser tratado como valendo zero.
 */
export function ordenarJoias<T extends { cartaId: string; raridade: string | null; localId: string }>(
  cartas: readonly T[],
  valorPorCarta: ReadonlyMap<string, number>,
): T[] {
  const comPreco: Array<{ carta: T; valor: number }> = [];
  const semPreco: T[] = [];
  for (const carta of cartas) {
    const valor = valorPorCarta.get(carta.cartaId);
    if (valor === undefined) semPreco.push(carta);
    else comPreco.push({ carta, valor });
  }
  comPreco.sort((a, b) => b.valor - a.valor);
  return [...comPreco.map((x) => x.carta), ...ordenarPorDestaque(semPreco)];
}
