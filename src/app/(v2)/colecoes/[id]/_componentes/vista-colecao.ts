/**
 * As regras de tela da coleção na v2 (pacote 1d). Módulo puro: nada aqui lê
 * o DOM, a rede ou o `localStorage`; quem chama passa o que leu.
 *
 * ## Abas (decisão 1 de `docs/design-v2/README.md`)
 *
 * - **Set:** Fichário, Set inteiro, Upgrades, O que falta.
 * - **Pokédex:** as mesmas, e o "Set inteiro" se chama "Pokédex inteira". O
 *   fichário pagina pelo número nacional (a ordem das vagas, que já vem
 *   assim do servidor), e cada página diz a faixa de números que cobre.
 * - **Customizada:** só a lista inteira, na ordem de alocação, sem
 *   denominador. Não há vaga vazia (a vaga nasce ao alocar), então não há
 *   "o que falta"; e `GET .../melhorias` devolve lista vazia para ela (sem
 *   universo, "melhor" não quer dizer nada), então não há upgrade.
 *
 * A aba escolhida vai na URL (`?aba=`): um link para "o que falta" de uma
 * coleção abre direto nela, e voltar no navegador volta à aba.
 */

import { chaveVagaSet } from "@/lib/dominio/chave-vaga-set";
import type { Idioma } from "@/lib/dominio/enums";
import { REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { ParametroPokedex, TipoColecao } from "@/lib/dominio/parametro-colecao";

/* ------------------------------------------------------------------ Abas */

export const ABAS = ["fichario", "inteiro", "upgrades", "falta"] as const;
export type Aba = (typeof ABAS)[number];

export function abasDaColecao(tipo: TipoColecao): readonly Aba[] {
  return tipo === "customizada" ? ["inteiro"] : ABAS;
}

/** A aba de `?aba=`; um valor desconhecido, ou de aba que o tipo não tem, cai na primeira. */
export function abaDaUrl(valor: string | null | undefined, tipo: TipoColecao): Aba {
  const abas = abasDaColecao(tipo);
  return abas.find((a) => a === valor) ?? abas[0];
}

/**
 * As vagas que cada aba mostra, na ordem da grade: o fichário e a lista
 * inteira mostram todas; "O que falta", as vazias; Upgrades, as cheias com
 * upgrade. É com esta lista que o foco volta do detalhe: se a vaga que abriu
 * saiu da aba (alocada no "O que falta", trocada nos Upgrades), o foco vai
 * para a que ficou no mesmo lugar da lista.
 */
export function vagasDaAba<V extends { copia?: unknown; upgrade?: unknown }>(aba: Aba, vagas: readonly V[]): readonly V[] {
  if (aba === "falta") return vagas.filter((v) => !v.copia);
  if (aba === "upgrades") return vagas.filter((v) => v.copia && v.upgrade);
  return vagas;
}

/**
 * Para onde o foco volta quando o detalhe fecha: a própria vaga, se ainda
 * está na aba; senão a que ocupa agora a posição que ela tinha (a seguinte,
 * ou a última, se ela era a última); `null` com a aba vazia.
 */
export function vagaDoFoco<V extends { id: string }>(lista: readonly V[], id: string, posicao: number): V | null {
  const propria = lista.find((v) => v.id === id);
  if (propria) return propria;
  if (lista.length === 0) return null;
  return lista[Math.min(Math.max(0, posicao), lista.length - 1)];
}

/* ------------------------------------------------------- Preferências */

/**
 * Preferências de exibição, por aparelho (regra 19 de `rules.md`): chave com
 * prefixo `v2-`, lida depois da hidratação, todo acesso em `try/catch` por
 * quem chama. Aqui só a leitura do valor guardado.
 */
export const CHAVE_GRADE_FICHARIO = "v2-colecao-fichario";
export const CHAVE_TAMANHO_INTEIRO = "v2-colecao-tamanho";

export const GRADES_FICHARIO = [3, 4, 5, 6] as const;
export type GradeFichario = (typeof GRADES_FICHARIO)[number];

export function lerGradeFichario(guardado: string | null): GradeFichario {
  const n = Number(guardado);
  return GRADES_FICHARIO.find((g) => g === n) ?? 3;
}

/**
 * Os tamanhos da lista inteira: a menor largura da célula, em px. O menor
 * ainda dá 44 px de alvo de toque; o vão entre células nunca fica abaixo de
 * 8 px (`vaoDoTamanho`).
 */
export const TAMANHOS_INTEIRO = [48, 72, 104, 150] as const;
export type TamanhoInteiro = 0 | 1 | 2 | 3;

export function lerTamanhoInteiro(guardado: string | null): TamanhoInteiro {
  const n = Number(guardado);
  return guardado !== null && Number.isInteger(n) && n >= 0 && n < TAMANHOS_INTEIRO.length ? (n as TamanhoInteiro) : 1;
}

export function vaoDoTamanho(tamanho: TamanhoInteiro): { x: number; y: number } {
  const min = TAMANHOS_INTEIRO[tamanho];
  return { x: Math.max(8, Math.round(min * 0.1 + 2)), y: Math.max(10, Math.round(min * 0.12)) };
}

/** Quantas colunas do fichário cabem num tamanho da lista inteira: o que a célula mostra muda com ele. */
export function densidadeDoTamanho(tamanho: TamanhoInteiro): GradeFichario {
  return ([6, 5, 4, 3] as const)[tamanho];
}

/* --------------------------------------------------------------- Fichário */

export function porPagina(grade: GradeFichario): number {
  return grade * grade;
}

export function totalDePaginas(totalVagas: number, grade: GradeFichario): number {
  return Math.max(1, Math.ceil(totalVagas / porPagina(grade)));
}

export function paginaDoIndice(indice: number, grade: GradeFichario): number {
  return Math.floor(Math.max(0, indice) / porPagina(grade));
}

/**
 * A primeira página da vista. Com duas páginas abertas (o fichário aberto no
 * desktop), a vista começa sempre numa página par: a 1 e a 2 juntas, nunca a
 * 2 e a 3 — como um fichário de verdade, a página da esquerda é o verso da
 * anterior.
 */
export function inicioDaVista(pagina: number, paginasPorVez: 1 | 2, totalPaginas: number): number {
  const limitada = Math.min(Math.max(0, pagina), Math.max(0, totalPaginas - 1));
  return paginasPorVez === 2 ? limitada - (limitada % 2) : limitada;
}

/** Os índices `[inicio, fim)` das vagas de uma página. */
export function faixaDaPagina(pagina: number, grade: GradeFichario, totalVagas: number): { inicio: number; fim: number } {
  const inicio = pagina * porPagina(grade);
  return { inicio: Math.min(inicio, totalVagas), fim: Math.min(inicio + porPagina(grade), totalVagas) };
}

/**
 * Trocar o tamanho do fichário mantém à vista a primeira vaga que estava à
 * vista: de 3×3 na página 5 (vagas 37 a 45) para 6×6, a página nova é a que
 * contém a vaga 37.
 */
export function paginaAposTrocarGrade(
  pagina: number,
  de: GradeFichario,
  para: GradeFichario,
  paginasPorVez: 1 | 2,
  totalVagas: number,
): number {
  const primeira = pagina * porPagina(de);
  return inicioDaVista(paginaDoIndice(primeira, para), paginasPorVez, totalDePaginas(totalVagas, para));
}

/**
 * O gesto de virar a página: um arrasto horizontal, mais largo que alto,
 * que passou de `MINIMO_VIRAR` px. Começar a menos de `BORDA_VOLTAR` px da
 * borda esquerda nunca vira: ali é o "voltar" do Safari (regra 3 de
 * `rules.md`). Devolve o sentido (+1 próxima, −1 anterior) ou 0.
 */
export const BORDA_VOLTAR = 24;
export const MINIMO_VIRAR = 48;

export function sentidoDoGesto(p: { xInicio: number; dx: number; dy: number }): -1 | 0 | 1 {
  if (p.xInicio < BORDA_VOLTAR) return 0;
  if (Math.abs(p.dx) < MINIMO_VIRAR || Math.abs(p.dx) <= Math.abs(p.dy) * 1.5) return 0;
  return p.dx < 0 ? 1 : -1;
}

/* ------------------------------------------------------------ Divisões */

/**
 * Onde cada divisão começa na lista de vagas (a ordem do servidor): é o
 * atalho para pular para uma região da Pokédex (o filtro por região da v1
 * virou navegação) ou para as secretas de um set.
 */
export function inicioDasDivisoes(vagas: readonly { divisao?: string }[]): Map<string, number> {
  const inicio = new Map<string, number>();
  vagas.forEach((v, i) => {
    if (v.divisao && !inicio.has(v.divisao)) inicio.set(v.divisao, i);
  });
  return inicio;
}

/* --------------------------------------------------------------- Escopo */

/**
 * O parâmetro de escopo depois de ligar ou desligar uma região, como a v1 o
 * manda a `PATCH /api/colecoes/:id/escopo`: todas as regiões voltam a ser
 * "nacional", e a ordem das regiões é a canônica. Tirar a última região não
 * é pedido (devolve `null`): uma Pokédex sem escopo não tem vaga nenhuma, e o
 * servidor recusaria.
 */
export function proximoEscopo(atual: ParametroPokedex, regiao: Regiao, incluir: boolean): ParametroPokedex | null {
  const atuais: readonly Regiao[] = atual.escopo === "nacional" ? REGIOES : atual.regioes;
  const novas = REGIOES.filter((r) => (r === regiao ? incluir : atuais.includes(r)));
  if (novas.length === 0) return null;
  if (novas.length === REGIOES.length) return { escopo: "nacional" };
  return { escopo: "regioes", regioes: novas };
}

export function regioesDoEscopo(p: ParametroPokedex): readonly Regiao[] {
  return p.escopo === "nacional" ? REGIOES : p.regioes;
}

/* ------------------------------------------------- Carta avulsa (set) */

/**
 * A busca do catálogo devolve uma linha por idioma; a coleção quer a CARTA
 * (set + número). Fica uma por carta, a do idioma de catálogo da coleção
 * quando existe. Japonês só entra numa coleção japonesa, e o contrário: o
 * japonês tem `set_id` próprio e nunca completa o pt/en (`AGENTS.md`,
 * "Catalog language is decided card by card"). A ordem é a da busca.
 */
export function umaLinhaPorCarta<C extends { setId: string; localId: string; idiomaCatalogo: Idioma }>(
  cartas: readonly C[],
  idiomaCatalogo: Idioma,
): C[] {
  const japonesa = idiomaCatalogo === "jp";
  const porCarta = new Map<string, C>();
  for (const c of cartas) {
    if ((c.idiomaCatalogo === "jp") !== japonesa) continue;
    const chave = chaveVagaSet(c.setId, c.localId);
    const atual = porCarta.get(chave);
    if (!atual || (c.idiomaCatalogo === idiomaCatalogo && atual.idiomaCatalogo !== idiomaCatalogo)) porCarta.set(chave, c);
  }
  return [...porCarta.values()];
}

/* -------------------------------------------- Suas cartas que cabem */

/** O que o servidor confere no lote do tema: a mesma `quantidade` e o mesmo `jaNaColecao` da prévia. */
export function estadoDaCartaDoTema(c: { quantidade: number; jaNaColecao: boolean }): string {
  return `${c.quantidade}|${c.jaNaColecao}`;
}

/**
 * As marcas depois de reler "suas cartas que cabem neste tema" (a mesma
 * regra da v1): fora do idioma exigido nunca vem marcada; uma linha que não
 * estava na leitura anterior segue o padrão do servidor; uma que estava só
 * continua marcada se estava marcada e o estado dela não mudou — um lote que
 * outra aba dividiu mantém o id, mas é outra decisão, e volta desmarcado.
 */
export function marcasAposReler(
  lida: readonly { copiaId: string; quantidade: number; jaNaColecao: boolean; foraDePadrao: boolean; marcadaPorPadrao: boolean }[],
  anteriores: ReadonlyMap<string, string> | null,
  marcadas: ReadonlySet<string>,
): Set<string> {
  return new Set(
    lida
      .filter((c) => {
        if (c.foraDePadrao) return false;
        const antes = anteriores?.get(c.copiaId);
        if (antes === undefined) return c.marcadaPorPadrao;
        return antes === estadoDaCartaDoTema(c) && marcadas.has(c.copiaId);
      })
      .map((c) => c.copiaId),
  );
}
