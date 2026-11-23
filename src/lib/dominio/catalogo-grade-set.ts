/**
 * De qual catálogo sai a grade de cadastro de um set
 * (`GET /api/sets/:setId/cartas`). Módulo puro: o SQL só busca as linhas, a
 * decisão é daqui.
 *
 * Sem pedido, a grade usa o idioma preferido do set pela prioridade de sempre
 * (`resolverIdiomaCatalogoDoSet`: pt > en > jp) e cada carta acha a sua
 * ficha pt→en. É o comportamento de antes do parâmetro, e a v1 nunca o manda.
 *
 * **`?catalogo=jp` existe por causa de `neo1` a `neo4`** (decisão de
 * 2026-11-23). Esses quatro sets têm o mesmo `set_id` no inglês e no japonês
 * e são cartas diferentes: o `neo1` tem 111 cartas `1..111` em en e 96
 * `001..096` em jp, nenhum número em comum. Pela prioridade, a grade de um
 * deles era sempre a ocidental, e quem escolheu o set sob o filtro "Japonês"
 * para cadastrar a carta japonesa recebia as fichas inglesas. Com o pedido, a
 * grade usa **só** o japonês — o japonês nunca é fallback de pt/en, nem o
 * contrário (`AGENTS.md`, "Catalog language is decided card by card").
 *
 * O pedido só vale para um set que tem fichas japonesas; sem elas, a grade
 * japonesa não existe e a rota responde 404, como para um set que não
 * existe — nunca cai para o ocidental em silêncio, que era o defeito.
 */

import { type IdiomaCatalogo, resolverIdiomaCatalogoDoSet } from "./idioma-catalogo";

/** O catálogo que a tela pede: só o japonês tem pedido; sem ele, o padrão. */
export type CatalogoPedidoGrade = "jp" | null;

export type LeituraCatalogoPedido = { ok: true; catalogo: CatalogoPedidoGrade } | { ok: false };

/**
 * Lê o parâmetro da URL (`searchParams.getAll("catalogo")`). Ausente é o
 * padrão; `jp` é o japonês; qualquer outra coisa — vazio, outro idioma,
 * caixa diferente, repetido — é recusado, nunca ignorado: um parâmetro mal
 * escrito que caísse no padrão traria a grade ocidental de `neo1` a quem
 * pediu a japonesa, sem aviso.
 */
export function lerCatalogoPedido(valores: readonly string[]): LeituraCatalogoPedido {
  if (valores.length === 0) return { ok: true, catalogo: null };
  if (valores.length === 1 && valores[0] === "jp") return { ok: true, catalogo: "jp" };
  return { ok: false };
}

/**
 * O idioma preferido da grade, a partir dos idiomas em que o set existe no
 * catálogo local (linhas ativas) e do pedido. `null` quando a grade pedida
 * não existe: o pedido japonês num set sem ficha japonesa.
 */
export function idiomaDaGradeDoSet(
  idiomasPresentes: readonly IdiomaCatalogo[],
  pedido: CatalogoPedidoGrade,
): IdiomaCatalogo | null {
  if (pedido === "jp") return idiomasPresentes.includes("jp") ? "jp" : null;
  return resolverIdiomaCatalogoDoSet(idiomasPresentes);
}
