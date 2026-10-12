/**
 * Estrutura da navegação, compartilhada entre a barra lateral (`Nav`) e a
 * trilha da barra superior (`TopBar`) — as duas precisam responder "onde
 * eu estou" a partir do mesmo mapa, e duplicá-lo faria as duas divergirem.
 *
 * Cada item tem um glifo Lucide, como o design system pede. O grupo da
 * Living Dex só aparece com o módulo ligado (`lib/modulos.ts`): quem decide
 * é o layout, no servidor, e passa a escolha para a `Nav` (`gruposDaNav`).
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
  chaveTitulo: string;
  itens: readonly ItemNav[];
}

export const GRUPOS: readonly GrupoNav[] = [
  {
    chaveTitulo: "grupos.cadastro",
    itens: [
      { href: "/cadastro/set", chaveLabel: "itens.porSet", icone: "grid-2x2" },
      { href: "/cadastro/busca", chaveLabel: "itens.porBusca", icone: "search" },
    ],
  },
  {
    chaveTitulo: "grupos.inventario",
    itens: [
      { href: "/inventario/visao-geral", chaveLabel: "itens.visaoGeral", icone: "chart-pie" },
      { href: "/inventario", chaveLabel: "itens.inventario", icone: "library" },
      { href: "/inventario/repetidas", chaveLabel: "itens.repetidas", icone: "copy" },
      { href: "/inventario/precos", chaveLabel: "itens.precos", icone: "tag" },
    ],
  },
  {
    chaveTitulo: "grupos.colecoes",
    itens: [{ href: "/colecoes", chaveLabel: "itens.colecoes", icone: "layers" }],
  },
] as const;

/** Módulo opcional (`MODULO_LIVING_DEX=1`), depois de Coleções. */
export const GRUPO_LIVING_DEX: GrupoNav = {
  chaveTitulo: "grupos.livingDex",
  itens: [
    { href: "/dex/pokedex", chaveLabel: "itens.pokedex", icone: "book-open" },
    { href: "/dex/cadastrar", chaveLabel: "itens.cadastrarDex", icone: "circle-plus" },
    { href: "/dex/inventario", chaveLabel: "itens.inventarioDex", icone: "library" },
    { href: "/dex/jogos", chaveLabel: "itens.meusJogos", icone: "gamepad-2" },
  ],
};

/** Os grupos que a barra lateral mostra, conforme os módulos ligados. */
export function gruposDaNav(livingDex: boolean): readonly GrupoNav[] {
  return livingDex ? [...GRUPOS, GRUPO_LIVING_DEX] : GRUPOS;
}

/* A busca do item ativo olha todos os grupos, inclusive os de módulo: com o
   módulo desligado as rotas dele dão 404 e nunca chegam a acender nada. */
const TODOS_GRUPOS: readonly GrupoNav[] = [...GRUPOS, GRUPO_LIVING_DEX];
const TODOS_ITENS = TODOS_GRUPOS.flatMap((g) => g.itens);

/**
 * Item ativo = o href de maior comprimento que é prefixo do caminho
 * atual (ou igual a ele). Assim `/colecoes/<id>` acende "Coleções" e
 * `/inventario/visao-geral` acende "Visão geral" — nunca "Inventário"
 * junto, mesmo `/inventario` sendo prefixo textual dele.
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

/** Grupo a que um item pertence — a primeira parte da trilha da TopBar. */
export function grupoDoItem(item: ItemNav): GrupoNav | null {
  return TODOS_GRUPOS.find((g) => g.itens.includes(item)) ?? null;
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
