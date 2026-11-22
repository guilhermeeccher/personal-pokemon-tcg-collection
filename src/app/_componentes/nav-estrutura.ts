/**
 * Estrutura da navegação, compartilhada entre a barra lateral (`Nav`) e a
 * trilha da barra superior (`TopBar`) — as duas precisam responder "onde
 * eu estou" a partir do mesmo mapa, e duplicá-lo faria as duas divergirem.
 *
 * Cada item tem um glifo Lucide, como o design system pede. O grupo da
 * Living Dex só aparece com o módulo ligado (`lib/modulos.ts`): quem decide
 * é o layout, no servidor, e passa a escolha para a `Nav` (`modulosDaNav`).
 */

import type { NomeIcone } from "./icone";

/*
 * O mapa guarda CHAVE de tradução, não texto: a barra lateral e a trilha
 * resolvem o rótulo no idioma da vez (namespace `nav` dos catálogos em
 * `messages/`). O `href` continua sendo o caminho real, em português e
 * inalterado — a tradução não mexe em rota.
 */
export interface ItemNav {
  href: string;
  chaveLabel: string;
  icone: NomeIcone;
}

export interface GrupoNav {
  /** Nulo: grupo sem título, logo abaixo do nome do módulo (a Visão geral do Virtual Game). */
  chaveTitulo: string | null;
  itens: readonly ItemNav[];
}

/**
 * Um módulo do menu (decisão de 2026-10-12): TCG (as cartas) e Virtual Game
 * (a Living Dex). Cada um com cabeçalho próprio e uma linha separando, para
 * o menu não parecer uma lista só.
 */
export interface ModuloNav {
  chaveTitulo: string;
  icone: NomeIcone;
  grupos: readonly GrupoNav[];
}

export const GRUPOS: readonly GrupoNav[] = [
  {
    chaveTitulo: "grupos.cadastro",
    itens: [
      { href: "/v1/cadastro/set", chaveLabel: "itens.porSet", icone: "grid-2x2" },
      { href: "/v1/cadastro/busca", chaveLabel: "itens.porBusca", icone: "search" },
    ],
  },
  {
    chaveTitulo: "grupos.inventario",
    itens: [
      { href: "/v1/inventario/visao-geral", chaveLabel: "itens.visaoGeral", icone: "chart-pie" },
      { href: "/v1/inventario", chaveLabel: "itens.inventario", icone: "library" },
      { href: "/v1/inventario/repetidas", chaveLabel: "itens.repetidas", icone: "copy" },
      { href: "/v1/inventario/precos", chaveLabel: "itens.precos", icone: "tag" },
    ],
  },
  {
    chaveTitulo: "grupos.colecoes",
    itens: [{ href: "/v1/colecoes", chaveLabel: "itens.colecoes", icone: "layers" }],
  },
] as const;

export const MODULO_TCG: ModuloNav = { chaveTitulo: "modulos.tcg", icone: "layers", grupos: GRUPOS };

/** Módulo opcional (`MODULO_LIVING_DEX=1`), depois do TCG. */
export const MODULO_VIRTUAL_GAME: ModuloNav = {
  chaveTitulo: "modulos.virtualGame",
  icone: "gamepad-2",
  grupos: [
    { chaveTitulo: null, itens: [{ href: "/v1/dex", chaveLabel: "itens.visaoGeralDex", icone: "chart-pie" }] },
    {
      chaveTitulo: "grupos.dex",
      itens: [
        { href: "/v1/dex/pokedex", chaveLabel: "itens.pokedex", icone: "book-open" },
        { href: "/v1/dex/caixas", chaveLabel: "itens.caixas", icone: "layout-grid" },
        { href: "/v1/dex/recebidos", chaveLabel: "itens.recebidos", icone: "inbox" },
        { href: "/v1/dex/cadastrar", chaveLabel: "itens.cadastrarDex", icone: "circle-plus" },
        { href: "/v1/dex/novo-cadastro", chaveLabel: "itens.novoCadastroDex", icone: "square-plus" },
        { href: "/v1/dex/inventario", chaveLabel: "itens.inventarioDex", icone: "library" },
      ],
    },
    {
      chaveTitulo: "grupos.progresso",
      itens: [
        { href: "/v1/dex/jogos", chaveLabel: "itens.meusJogos", icone: "gamepad-2" },
        { href: "/v1/dex/trofeus", chaveLabel: "itens.trofeus", icone: "trophy" },
        { href: "/v1/dex/planos", chaveLabel: "itens.planos", icone: "list-checks" },
      ],
    },
  ],
};

/** Os módulos que a barra lateral mostra, conforme os ligados. */
export function modulosDaNav(livingDex: boolean): readonly ModuloNav[] {
  return livingDex ? [MODULO_TCG, MODULO_VIRTUAL_GAME] : [MODULO_TCG];
}

/* A busca do item ativo olha todos os módulos, inclusive o opcional: com ele
   desligado as rotas dele dão 404 e nunca chegam a acender nada. */
const TODOS_MODULOS: readonly ModuloNav[] = [MODULO_TCG, MODULO_VIRTUAL_GAME];
const TODOS_GRUPOS: readonly GrupoNav[] = TODOS_MODULOS.flatMap((m) => m.grupos);
const TODOS_ITENS = TODOS_GRUPOS.flatMap((g) => g.itens);

/**
 * Item ativo = o href de maior comprimento que é prefixo do caminho
 * atual (ou igual a ele). Assim `/v1/colecoes/<id>` acende "Coleções" e
 * `/v1/inventario/visao-geral` acende "Visão geral" — nunca "Inventário"
 * junto, mesmo `/v1/inventario` sendo prefixo textual dele.
 */
export function encontrarAtivo(pathname: string): ItemNav | null {
  let melhor: ItemNav | null = null;
  for (const item of TODOS_ITENS) {
    const casa = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (casa && (melhor === null || item.href.length > melhor.href.length)) {
      melhor = item;
    }
  }
  return melhor;
}

/**
 * A primeira parte da trilha da TopBar: o título do grupo do item, ou o do
 * módulo quando o grupo não tem título.
 */
export function tituloDaTrilha(item: ItemNav): string | null {
  for (const m of TODOS_MODULOS) {
    const g = m.grupos.find((x) => x.itens.includes(item));
    if (g) return g.chaveTitulo ?? m.chaveTitulo;
  }
  return null;
}

/** As onze cores de tipo, na fileira de pontos do rodapé da lombada. */
export const ENERGIAS = [
  "fogo",
  "agua",
  "planta",
  "eletrico",
  "psiquico",
  "lutador",
  "sombrio",
  "metal",
  "fada",
  "dragao",
  "incolor",
] as const;
