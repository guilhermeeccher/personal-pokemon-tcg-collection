/**
 * "Suas cartas que cabem neste tema": a lista que a coleção temática oferece
 * logo depois de criada e, depois, na página dela ("N cartas novas cabem
 * neste tema"). Ela **só lista** — quem aloca é o clique do usuário, num lote
 * só (`lib/db/cartas-do-tema.ts`), pelo mesmo caminho de alocação da
 * customizada.
 *
 * ## Quem entra
 *
 * As cópias **livres** (sem vaga em coleção nenhuma — regra 1) cuja linha de
 * catálogo é ocidental e cabe no tema (`linhaCasaComTema`). Cópia de idioma
 * físico fora do `idiomaExigido` da coleção entra marcada `foraDePadrao`,
 * nunca omitida, como na lista de candidatos de uma vaga.
 *
 * ## Uma cópia por carta, a menos que o usuário escolha outra coisa
 *
 * A lista mostra toda cópia livre que cabe, mas só **uma por carta física**
 * (`carta_id`) vem marcada (`marcarUmaPorCarta`): a primeira na ordem da
 * lista, que põe dentro de cada carta a de idioma no padrão antes da fora
 * dele e a cópia mais antiga antes da mais nova. Não vem marcada nenhuma de
 * uma carta que a coleção já tem, nem cópia fora do padrão. Marcar uma segunda
 * cópia da mesma carta é gesto do usuário; o sistema nunca põe duas no
 * silêncio. Um lote de várias unidades (`quantidade > 1`) é uma linha só, e
 * alocar tira dele uma unidade (a divisão de lote de sempre).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import { compararLocalId } from "./ordenacao";
import type { Leitura } from "./grupos-colecao";
import { recusa, type Recusa } from "./recusa";
import { ehLinhaOcidental, linhaCasaComTema, type LinhaTematica, type TemaColecao } from "./tema-colecao";
import { canonizarUuid, ehUuid } from "./uuid";

/** Teto de cópias num lote de "alocar as cartas do tema". */
export const MAXIMO_COPIAS_POR_LOTE_TEMA = 500;

/** Uma cópia livre como a leitura a traz, antes do filtro do tema. */
export interface CopiaLivreParaTema extends LinhaTematica {
  copiaId: string;
  cartaId: string;
  /** O idioma da LINHA de catálogo da cópia. */
  idiomaCatalogo: string;
  setId: string;
  setLancamento: string | null;
  localId: string;
  /** ISO, para desempatar pela mais antiga. */
  criadoEm: string;
  foraDePadrao: boolean;
}

/** As cópias que cabem no tema, só linhas ocidentais. */
export function filtrarCopiasDoTema<T extends CopiaLivreParaTema>(copias: readonly T[], tema: TemaColecao): T[] {
  return copias.filter((c) => ehLinhaOcidental(c.idiomaCatalogo) && linhaCasaComTema(c, tema));
}

/**
 * A ordem da lista: set mais antigo primeiro (sem data por último), depois o
 * set, o número impresso, e dentro da mesma carta a cópia no padrão antes da
 * fora dele e a mais antiga antes da mais nova.
 */
export function ordenarCartasDoTema<T extends CopiaLivreParaTema>(copias: readonly T[]): T[] {
  return [...copias].sort((a, b) => {
    if (a.setLancamento !== b.setLancamento) {
      if (a.setLancamento === null) return 1;
      if (b.setLancamento === null) return -1;
      return a.setLancamento < b.setLancamento ? -1 : 1;
    }
    if (a.setId !== b.setId) return a.setId < b.setId ? -1 : 1;
    const numero = compararLocalId(a.localId, b.localId);
    if (numero !== 0) return numero;
    if (a.cartaId !== b.cartaId) return a.cartaId < b.cartaId ? -1 : 1;
    if (a.foraDePadrao !== b.foraDePadrao) return a.foraDePadrao ? 1 : -1;
    if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? -1 : 1;
    return a.copiaId < b.copiaId ? -1 : a.copiaId > b.copiaId ? 1 : 0;
  });
}

/**
 * Marca uma cópia por carta, na ordem dada (ver o cabeçalho). `cartasNaColecao`
 * são os `carta_id` que a coleção já tem alocados: nenhuma cópia deles vem
 * marcada.
 */
export function marcarUmaPorCarta<T extends { cartaId: string; foraDePadrao: boolean }>(
  copias: readonly T[],
  cartasNaColecao: ReadonlySet<string>,
): (T & { jaNaColecao: boolean; marcadaPorPadrao: boolean })[] {
  const marcadas = new Set<string>();
  return copias.map((c) => {
    const jaNaColecao = cartasNaColecao.has(c.cartaId);
    const marcar = !jaNaColecao && !c.foraDePadrao && !marcadas.has(c.cartaId);
    if (marcar) marcadas.add(c.cartaId);
    return { ...c, jaNaColecao, marcadaPorPadrao: marcar };
  });
}

/** "N cartas novas cabem neste tema": cartas físicas distintas que a coleção ainda não tem. */
export function contarCartasNovas(copias: readonly { cartaId: string; jaNaColecao: boolean }[]): number {
  return new Set(copias.filter((c) => !c.jaNaColecao).map((c) => c.cartaId)).size;
}

/** Uma cópia do pedido, com o que a prévia mostrava dela. */
export interface ItemCartaDoTema {
  copiaId: string;
  /** As unidades do lote que a prévia mostrou (`CartaDoTemaDTO.quantidade`). */
  quantidade: number;
  /** Se a prévia mostrava a carta como já presente na coleção (`CartaDoTemaDTO.jaNaColecao`). */
  jaNaColecao: boolean;
}

export interface PedidoCartasDoTema {
  itens: ItemCartaDoTema[];
  permitirForaDePadrao: boolean;
}

/**
 * `{ itens: [{ copiaId, quantidade, jaNaColecao }], permitirForaDePadrao? }`:
 * de 1 a `MAXIMO_COPIAS_POR_LOTE_TEMA` cópias, sem repetição (uma cópia, uma
 * vaga — regra 1). Os ids saem canonizados.
 *
 * **Cada item leva o que a prévia mostrava** — as unidades do lote e se a
 * carta já estava na coleção —, e o lote confere isso sob a trava
 * (`conferirPedidoComEstado`). Só o id não basta: com um lote de 2 unidades,
 * duas abas confirmando a mesma cópia dividiriam o lote duas vezes (a divisão
 * deixa o id original livre), e a mesma carta entraria duas vezes no tema sem
 * o usuário ter marcado a segunda. Um corpo só com `copiaIds` (o formato
 * anterior) é recusado, de propósito.
 */
export function lerPedidoCartasDoTema(corpo: unknown): Leitura<PedidoCartasDoTema> {
  const obj = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const invalido = { ok: false as const, recusa: recusa("pedidoDeCartasDoTemaInvalido") };
  const brutos = obj.itens;
  if (!Array.isArray(brutos)) return invalido;
  if (brutos.length === 0 || brutos.length > MAXIMO_COPIAS_POR_LOTE_TEMA) {
    return {
      ok: false,
      recusa: recusa("quantidadeDeCartasDoTemaInvalida", { maximo: String(MAXIMO_COPIAS_POR_LOTE_TEMA) }),
    };
  }
  const itens: ItemCartaDoTema[] = [];
  const vistos = new Set<string>();
  for (const bruto of brutos) {
    const item = (typeof bruto === "object" && bruto !== null ? bruto : {}) as Record<string, unknown>;
    const { copiaId, quantidade, jaNaColecao } = item;
    if (typeof copiaId !== "string" || !ehUuid(copiaId)) return invalido;
    if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 1) return invalido;
    if (typeof jaNaColecao !== "boolean") return invalido;
    const canonico = canonizarUuid(copiaId);
    if (vistos.has(canonico)) return { ok: false, recusa: recusa("copiaRepetidaNoPedido") };
    vistos.add(canonico);
    itens.push({ copiaId: canonico, quantidade, jaNaColecao });
  }
  return { ok: true, valor: { itens, permitirForaDePadrao: obj.permitirForaDePadrao === true } };
}

/** O estado de uma cópia do pedido, lido sob a trava. */
export interface EstadoCopiaDoPedido extends LinhaTematica {
  cartaId: string;
  idiomaCatalogo: string;
  quantidade: number;
}

/**
 * Confere o pedido contra o estado lido sob a trava, antes de qualquer
 * escrita, e devolve a primeira recusa com o status da rota:
 *
 *  - cópia que sumiu: `copiaNaoEncontrada` (409);
 *  - lote com outra quantidade, ou carta que entrou na coleção depois da
 *    prévia (que a mostrava como nova): `cartasDoTemaDesatualizadas` (409) —
 *    outra aba alocou dela; o lote inteiro é velho, e nada é gravado;
 *  - cópia que não cabe no tema (ou de linha japonesa): `copiaForaDoTema` (400).
 *
 * A cópia já alocada em outra vaga quem recusa é a própria alocação
 * (`copiaJaAlocada`, 409).
 */
export function conferirPedidoComEstado(
  itens: readonly ItemCartaDoTema[],
  estado: ReadonlyMap<string, EstadoCopiaDoPedido>,
  cartasNaColecao: ReadonlySet<string>,
  tema: TemaColecao,
): { recusa: Recusa; status: 400 | 409 } | null {
  for (const item of itens) {
    const atual = estado.get(item.copiaId);
    if (!atual) return { recusa: recusa("copiaNaoEncontrada"), status: 409 };
    const entrouNaColecao = !item.jaNaColecao && cartasNaColecao.has(atual.cartaId);
    if (atual.quantidade !== item.quantidade || entrouNaColecao) {
      return { recusa: recusa("cartasDoTemaDesatualizadas"), status: 409 };
    }
    if (!ehLinhaOcidental(atual.idiomaCatalogo) || !linhaCasaComTema(atual, tema)) {
      return { recusa: recusa("copiaForaDoTema"), status: 400 };
    }
  }
  return null;
}
