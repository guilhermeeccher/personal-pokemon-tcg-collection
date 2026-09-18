import Link from "next/link";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Icone, type NomeIcone } from "@/app/_componentes/icone";
import { Painel } from "@/app/_componentes/painel";

/* Os mesmos glifos da barra lateral, para o atalho e o item de navegação
   serem reconhecíveis como a mesma coisa. */
const ATALHOS: readonly { href: string; titulo: string; descricao: string; icone: NomeIcone }[] = [
  {
    href: "/inventario/visao-geral",
    icone: "chart-pie",
    titulo: "Visão geral",
    descricao:
      "Quanto você tem e como está distribuído: totais, expansão, raridade, idioma, condição, variante e progresso das coleções.",
  },
  {
    href: "/cadastro/set",
    icone: "grid-2x2",
    titulo: "Cadastro rápido por set",
    descricao:
      "Escolha uma expansão e marque a grade inteira de cartas em uma única submissão.",
  },
  {
    href: "/cadastro/busca",
    icone: "search",
    titulo: "Cadastro por busca",
    descricao: "Para carta avulsa: busque por nome, set ou número.",
  },
  {
    href: "/inventario",
    icone: "library",
    titulo: "Inventário",
    descricao:
      "Lista com busca e filtros: set, idioma, raridade, variante, condição, graded, localização, alocada/livre.",
  },
  {
    href: "/inventario/repetidas",
    icone: "copy",
    titulo: "Repetidas",
    descricao:
      "O que sobra para troca: total, alocadas e livres por carta, com o idioma físico de cada cópia.",
  },
  {
    href: "/colecoes",
    icone: "layers",
    titulo: "Coleções",
    descricao:
      "Pokédex, set ou customizada: grade de vagas, alocação de cópias e a lista do que falta.",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Coleção Pokémon"
        descricao="Inventário e coleções — cadastro rápido por set é o ponto de partida para digitar a coleção física."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Painel
            key={a.href}
            as={Link}
            href={a.href}
            className="[transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
          >
            <h2 className="flex items-center gap-2 text-[length:var(--fs-title-2)] text-strong">
              <span className="text-accent">
                <Icone nome={a.icone} tamanho={17} />
              </span>
              {a.titulo}
            </h2>
            <p className="mt-1 text-sm text-muted">{a.descricao}</p>
          </Painel>
        ))}
      </div>
    </main>
  );
}
