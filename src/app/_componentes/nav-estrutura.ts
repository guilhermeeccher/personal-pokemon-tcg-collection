/**
 * Estrutura da navegação, compartilhada entre a barra lateral (`Nav`) e a
 * trilha da barra superior (`TopBar`) — as duas precisam responder "onde
 * eu estou" a partir do mesmo mapa, e duplicá-lo faria as duas divergirem.
 *
 * Nenhuma rota nova: são exatamente os itens que a navegação já tinha, com
 * um glifo Lucide cada, como o design system pede.
 */

import type { NomeIcone } from "./icone";

export interface ItemNav {
  href: string;
  label: string;
  icone: NomeIcone;
}

export interface GrupoNav {
  titulo: string;
  itens: readonly ItemNav[];
}

export const GRUPOS: readonly GrupoNav[] = [
  {
    titulo: "Cadastro",
    itens: [
      { href: "/cadastro/set", label: "Por set", icone: "grid-2x2" },
      { href: "/cadastro/busca", label: "Por busca", icone: "search" },
    ],
  },
  {
    titulo: "Inventário",
    itens: [
      { href: "/inventario/visao-geral", label: "Visão geral", icone: "chart-pie" },
      { href: "/inventario", label: "Inventário", icone: "library" },
      { href: "/inventario/repetidas", label: "Repetidas", icone: "copy" },
    ],
  },
  {
    titulo: "Coleções",
    itens: [{ href: "/colecoes", label: "Coleções", icone: "layers" }],
  },
] as const;

const TODOS_ITENS = GRUPOS.flatMap((g) => g.itens);

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
  return GRUPOS.find((g) => g.itens.includes(item)) ?? null;
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
