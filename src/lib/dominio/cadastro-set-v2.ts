/**
 * O cadastro por set da v2 (`/cadastro/set`): o que a tela calcula em cima
 * da grade e do estado do lote. Módulo puro — o estado do lote e a regra de
 * materialização são os da v1 (`grade-set.ts`), e o pedido é o mesmo
 * (`POST /api/sets/:setId/copias`, `construirItensSubmissao`); aqui fica só o
 * que a tela nova mostra a mais.
 */

import type { Condicao, Idioma, VarianteCopia } from "./enums";
import type { DefaultsGrade, EstadoGrade, ItemSubmissaoGrade, LinhaGrade } from "./grade-set";
import type { CatalogoDoSet } from "./nova-colecao-v2";
import {
  type FlagsVariantesCatalogo,
  escolherVarianteDisponivel,
  variantesDisponiveis,
} from "./variantes-catalogo";

/**
 * A URL da grade. O catálogo japonês vai pedido (`?catalogo=jp`): é o que
 * separa as cartas japonesas de `neo1` a `neo4` das ocidentais de mesmo
 * `set_id` (`catalogo-grade-set.ts`). O ocidental vai sem parâmetro, o mesmo
 * pedido da v1.
 */
export function caminhoGradeDoSet(setId: string, catalogo: CatalogoDoSet): string {
  const base = `/api/sets/${encodeURIComponent(setId)}/cartas`;
  return catalogo === "jp" ? `${base}?catalogo=jp` : base;
}

export interface ValoresDaCarta {
  variante: VarianteCopia;
  idioma: Idioma;
  condicao: Condicao;
  /** Os campos em que a carta foi ajustada fora do padrão do lote, na ordem da tela. */
  ajustes: readonly (keyof DefaultsGrade)[];
  /**
   * O catálogo não tem a variante do padrão para esta carta (o Alakazam do
   * Base Set só existe holo): ela vai com a primeira que tem. É o aviso de
   * variante fora do padrão — a v1 mostrava o padrão impossível no select e
   * trocava sozinha na hora de marcar; aqui a tela diz antes.
   */
  semVarianteDoPadrao: boolean;
  /**
   * A variante que a carta leva no lugar da do padrão, quando é essa troca
   * automática que vale; `null` quando a carta tem a do padrão ou quando a
   * pessoa escolheu outra à mão (aí é um ajuste, não um aviso).
   */
  varianteNoLugar: VarianteCopia | null;
}

/**
 * O que a carta mostra e o que vai gravar. Uma carta ainda não marcada mostra
 * o padrão do lote, com a variante já resolvida contra o catálogo dela —
 * exatamente o que `reduzirGrade` materializa quando ela ganhar quantidade.
 */
export function valoresDaCarta(
  linha: LinhaGrade | undefined,
  padrao: DefaultsGrade,
  flags: FlagsVariantesCatalogo,
): ValoresDaCarta {
  const automatica = escolherVarianteDisponivel(padrao.variante, flags);
  const variante = linha?.variante ?? automatica;
  const semVarianteDoPadrao = !variantesDisponiveis(flags).includes(padrao.variante);
  const idioma = linha?.idioma ?? padrao.idioma;
  const condicao = linha?.condicao ?? padrao.condicao;
  const varianteNoLugar = semVarianteDoPadrao && variante === automatica ? variante : null;
  // A troca automática da variante é o aviso (`varianteNoLugar`), não um
  // ajuste: a pessoa não mexeu na carta.
  const ajustes: (keyof DefaultsGrade)[] = [];
  if (variante !== padrao.variante && !varianteNoLugar) ajustes.push("variante");
  if (idioma !== padrao.idioma) ajustes.push("idioma");
  if (condicao !== padrao.condicao) ajustes.push("condicao");
  return {
    variante,
    idioma,
    condicao,
    ajustes,
    semVarianteDoPadrao,
    varianteNoLugar,
  };
}

/** Quantas cartas e quantas cópias o lote leva. */
export function totaisDoLote(estado: EstadoGrade): { cartas: number; copias: number } {
  let cartas = 0;
  let copias = 0;
  for (const linha of Object.values(estado.linhas)) {
    if (linha.quantidade > 0) {
      cartas += 1;
      copias += linha.quantidade;
    }
  }
  return { cartas, copias };
}

/** O maior número que o campo aceita: quatro dígitos. */
export const QUANTIDADE_MAXIMA = 9999;

/**
 * O texto do campo de quantidade como número: só os dígitos, vazio é zero, e
 * nunca passa de `QUANTIDADE_MAXIMA`. O campo é texto com teclado numérico,
 * não `type="number"`: as setas são da grade (andam de carta em carta), e o
 * número não muda com a roda do mouse por cima.
 */
export function quantidadeDoTexto(texto: string): number {
  const digitos = texto.replace(/\D/g, "").slice(0, 4);
  return digitos === "" ? 0 : Math.min(QUANTIDADE_MAXIMA, Number(digitos));
}

/** A carta depois desta na lista à vista (o Enter), ou `null` na última. */
export function proximaCarta(ids: readonly string[], atual: string): string | null {
  const i = ids.indexOf(atual);
  if (i === -1) return null;
  return ids[i + 1] ?? null;
}

/* ---------------------------------------------------------- Resultado */

/** Um item recusado, como a rota o devolve em `detalhes` (`indice` no corpo enviado). */
export interface DetalheRecusaLote {
  indice: number;
  cartaId: string | null;
}

export type RespostaLote =
  | { tipo: "gravado"; inseridas: number; fundidas: number }
  | { tipo: "recusado"; detalhes: readonly DetalheRecusaLote[] }
  /**
   * Nem gravação confirmada nem recusa da rota: 5xx, um proxy no caminho, um
   * corpo que não é o da rota. O lote pode ter entrado (a resposta pode ter
   * se perdido depois do commit), então a tela trata como a queda de rede —
   * mantém o lote, avisa e relê —, nunca como "nada foi gravado".
   */
  | { tipo: "incerto" };

function ehNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Lê a resposta do `POST` em lote sem confiar na forma. Gravado é um 2xx com
 * as contagens. Recusado é só o que a rota recusa de fato: um 4xx que traz a
 * chave da recusa (`{ recusa: { chave } }`, todas as recusas da rota), com os
 * itens recusados em `detalhes`, cada um pelo índice no corpo enviado. O
 * resto é incerto. O texto da recusa é traduzido por `textoDaRecusa`, fora
 * daqui.
 */
export function lerRespostaLote(status: number, corpo: unknown): RespostaLote {
  const c = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    if (!ehNumero(c.inseridas) && !ehNumero(c.fundidas)) return { tipo: "incerto" };
    return {
      tipo: "gravado",
      inseridas: ehNumero(c.inseridas) ? c.inseridas : 0,
      fundidas: ehNumero(c.fundidas) ? c.fundidas : 0,
    };
  }
  const recusa = c.recusa as Record<string, unknown> | undefined;
  if (status < 400 || status >= 500 || typeof recusa !== "object" || recusa === null || typeof recusa.chave !== "string") {
    return { tipo: "incerto" };
  }
  const detalhes = Array.isArray(c.detalhes)
    ? c.detalhes.flatMap((d): DetalheRecusaLote[] => {
        if (typeof d !== "object" || d === null) return [];
        const { indice, cartaId } = d as Record<string, unknown>;
        if (!ehNumero(indice)) return [];
        return [{ indice, cartaId: typeof cartaId === "string" ? cartaId : null }];
      })
    : [];
  return { tipo: "recusado", detalhes };
}

export interface LinhaResultado {
  item: ItemSubmissaoGrade;
  recusada: boolean;
}

/**
 * O resultado linha a linha: cada item enviado, e se o servidor o recusou. O
 * índice da recusa aponta para o corpo enviado; ela só vale para a linha se o
 * `cartaId` bater (quando a rota o manda), para nunca marcar a carta errada.
 * Uma recusa do lote inteiro (índice -1, corpo malformado) não marca linha
 * nenhuma — `geral` diz que houve.
 */
export function resultadoPorLinha(
  itens: readonly ItemSubmissaoGrade[],
  detalhes: readonly DetalheRecusaLote[],
): { linhas: LinhaResultado[]; geral: boolean } {
  const recusados = new Set<number>();
  let geral = false;
  for (const d of detalhes) {
    const item = itens[d.indice];
    if (!item || (d.cartaId !== null && d.cartaId !== item.cartaId)) {
      geral = true;
      continue;
    }
    recusados.add(d.indice);
  }
  return { linhas: itens.map((item, i) => ({ item, recusada: recusados.has(i) })), geral };
}
