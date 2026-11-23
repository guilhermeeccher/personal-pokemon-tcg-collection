/**
 * O estado da tela de inventário da v2 que dá para decidir sem React nem
 * rede: as chaves de filtro da URL, a consulta a `GET /api/copias`, o
 * endereço que a tela escreve na barra, a seleção e o corpo da edição em
 * massa. Módulo puro, testado em `estado-inventario.test.ts`.
 *
 * **As chaves da URL são as da v1, com os mesmos valores.** A visão geral, a
 * tela de repetidas e o início linkam para `/inventario?set=…`,
 * `?alocacao=livre` etc.; um link antigo, ou um da v1 aberto na v2, tem de
 * abrir o mesmo recorte. Por isso o valor vai cru para a API, como a v1 o
 * manda: um valor que a API não aceita (`?idioma=xx`) dá a mesma recusa nas
 * duas versões — na v2 ela aparece como erro, em vez da lista vazia muda que
 * a v1 mostra.
 */

import type { Condicao, Idioma, VarianteCopia } from "@/lib/dominio/enums";
import { type FlagsVariantesCatalogo, variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";

/**
 * As chaves de filtro, na ordem da v1 (`FILTROS_VAZIOS` de
 * `(v1)/v1/inventario/pagina-cliente.tsx`). A ordem importa: é a da query de
 * `GET /api/copias`, que fica igual à da v1, byte a byte.
 */
export const CHAVES_FILTRO = [
  "set",
  "idioma",
  "raridade",
  "variante",
  "condicao",
  "graded",
  "localizacao",
  "alocacao",
  "semImagem",
  "q",
] as const;

export type ChaveFiltro = (typeof CHAVES_FILTRO)[number];
export type FiltrosTela = Record<ChaveFiltro, string>;

export const FILTROS_VAZIOS: FiltrosTela = Object.freeze(
  Object.fromEntries(CHAVES_FILTRO.map((c) => [c, ""])) as FiltrosTela,
);

/** Os de texto livre: digitados letra a letra, a consulta espera a pessoa parar. */
export const FILTROS_DE_TEXTO: readonly ChaveFiltro[] = ["q", "localizacao"];

/** 50 por página, como a v1. */
export const TAMANHO_PAGINA = 50;

type ParametrosBusca = Record<string, string | string[] | undefined>;

/**
 * O primeiro valor de uma chave, como `URLSearchParams.get` da v1: repetida,
 * vale a primeira. `searchParams` do Next chega já decodificado.
 */
function primeiro(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** Os filtros que a URL traz. Chave desconhecida é ignorada, como na v1. */
export function filtrosDaUrl(busca: ParametrosBusca): FiltrosTela {
  const filtros = { ...FILTROS_VAZIOS };
  for (const chave of CHAVES_FILTRO) filtros[chave] = primeiro(busca[chave]);
  return filtros;
}

/**
 * A página que a URL traz. `pagina` é a única chave que a v2 acrescenta: a v1
 * não a lê nem escreve (ela a ignora, e abre na primeira), e a v2 a escreve
 * para "voltar" e recarregar manterem a página. Qualquer coisa que não seja
 * inteiro de 1 para cima é a primeira página.
 */
export function paginaDaUrl(busca: ParametrosBusca): number {
  const bruto = primeiro(busca.pagina);
  if (!/^[1-9][0-9]{0,5}$/.test(bruto)) return 1;
  return Number(bruto);
}

/**
 * A query de `GET /api/copias`: os filtros preenchidos na ordem de
 * `CHAVES_FILTRO`, depois `pagina` e `tamanhoPagina` — a mesma que a v1
 * monta em `paraQueryString`.
 */
export function consultaDaLista(filtros: FiltrosTela, pagina: number): string {
  const params = new URLSearchParams();
  for (const chave of CHAVES_FILTRO) {
    if (filtros[chave]) params.set(chave, filtros[chave]);
  }
  params.set("pagina", String(pagina));
  params.set("tamanhoPagina", String(TAMANHO_PAGINA));
  return params.toString();
}

/**
 * O endereço que a tela escreve na barra (`/inventario?…`): os filtros
 * preenchidos com as chaves da v1, e `pagina` só a partir da segunda.
 * Sem nada, `/inventario` puro.
 */
export function enderecoDaTela(filtros: FiltrosTela, pagina: number): string {
  const params = new URLSearchParams();
  for (const chave of CHAVES_FILTRO) {
    if (filtros[chave]) params.set(chave, filtros[chave]);
  }
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `/inventario?${query}` : "/inventario";
}

/** Quantos filtros do painel estão em uso — todos menos a busca por nome, que fica sempre à vista. */
export function filtrosNoPainel(filtros: FiltrosTela): number {
  return CHAVES_FILTRO.filter((c) => c !== "q" && filtros[c] !== "").length;
}

export function totalDePaginas(total: number): number {
  return Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
}

/**
 * Depois de uma leitura: a página pedida ficou além da última (a última cópia
 * dela foi removida, ou outra aba encolheu a lista)? Devolve a última página
 * que existe, para a tela ir até ela; `null` quando a página pedida serve.
 */
export function paginaAlemDoFim(pagina: number, total: number, itensNaPagina: number): number | null {
  if (itensNaPagina > 0 || pagina <= 1) return null;
  const ultima = totalDePaginas(total);
  return pagina > ultima ? ultima : null;
}

/**
 * A seleção depois de uma releitura: só fica o que ainda está na página. Uma
 * cópia removida (aqui ou em outra aba) não pode seguir selecionada e ir no
 * corpo da edição em massa — a rota recusaria o lote inteiro.
 */
export function podarSelecao(selecao: ReadonlySet<string>, itens: readonly { id: string }[]): Set<string> {
  const presentes = new Set(itens.map((i) => i.id));
  return new Set([...selecao].filter((id) => presentes.has(id)));
}

/** Selecionar todos da página, ou nenhum quando todos já estão. */
export function alternarTodos(selecao: ReadonlySet<string>, itens: readonly { id: string }[]): Set<string> {
  const todos = itens.length > 0 && itens.every((i) => selecao.has(i.id));
  return todos ? new Set() : new Set(itens.map((i) => i.id));
}

/**
 * As variantes que existem no catálogo para **todas** as cartas da seleção —
 * só elas podem ir para a seleção inteira, porque a rota recusa o lote todo se
 * uma carta não tiver a pedida. Vazio quando não há nenhuma em comum.
 */
export function variantesEmComum(itens: readonly FlagsVariantesCatalogo[]): VarianteCopia[] {
  if (itens.length === 0) return [];
  return itens
    .map((i) => variantesDisponiveis(i))
    .reduce((comum, disponiveis) => comum.filter((v) => disponiveis.includes(v)));
}

/** Os campos da edição em massa. Um campo `null` não muda. */
export interface EscolhaMassa {
  condicao: Condicao | null;
  /** Texto da localização; vazio apaga a localização das cópias. */
  localizacao: string | null;
  idioma: Idioma | null;
  variante: VarianteCopia | null;
}

export interface CorpoEdicaoMassa {
  copiaIds: string[];
  patch: { condicao?: Condicao; localizacao?: string | null; idioma?: Idioma; variante?: VarianteCopia };
}

/**
 * O corpo de `PATCH /api/copias/massa`, o mesmo da v1: `{ copiaIds, patch }`,
 * com só os campos marcados. Localização em branco vai como `null` (apaga),
 * como a v1 manda. `null` quando nada foi marcado ou não há cópia: não há o
 * que enviar.
 */
export function corpoEdicaoMassa(copiaIds: readonly string[], escolha: EscolhaMassa): CorpoEdicaoMassa | null {
  const patch: CorpoEdicaoMassa["patch"] = {};
  if (escolha.condicao !== null) patch.condicao = escolha.condicao;
  if (escolha.localizacao !== null) patch.localizacao = escolha.localizacao.trim() || null;
  if (escolha.idioma !== null) patch.idioma = escolha.idioma;
  if (escolha.variante !== null) patch.variante = escolha.variante;
  if (copiaIds.length === 0 || Object.keys(patch).length === 0) return null;
  return { copiaIds: [...copiaIds], patch };
}
