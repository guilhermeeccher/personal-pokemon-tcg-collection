import {
  BookOpen,
  ChartPie,
  CirclePlus,
  Copy,
  Ellipsis,
  Gamepad2,
  Grid2x2,
  House,
  Inbox,
  Layers,
  LayoutGrid,
  Library,
  ListChecks,
  type LucideIcon,
  Search,
  SquarePlus,
  Tag,
  Trophy,
} from "lucide-react";

import type { NomeIconeNav } from "./mapa-navegacao";

/* Os mesmos glifos da v1 para os mesmos lugares: quem já usa o app reconhece
   o item pelo desenho. Traço de 1,8, como no protótipo. */
const ICONES: Record<NomeIconeNav, LucideIcon> = {
  inicio: House,
  busca: Search,
  colecoes: Layers,
  inventario: Library,
  "visao-geral": ChartPie,
  repetidas: Copy,
  precos: Tag,
  "por-set": Grid2x2,
  dex: ChartPie,
  pokedex: BookOpen,
  caixas: LayoutGrid,
  recebidos: Inbox,
  cadastrar: CirclePlus,
  "novo-cadastro": SquarePlus,
  "inventario-dex": Library,
  jogos: Gamepad2,
  trofeus: Trophy,
  planos: ListChecks,
  mais: Ellipsis,
};

export function IconeNav({ nome, className }: { nome: NomeIconeNav; className?: string }) {
  const Icone = ICONES[nome];
  return <Icone className={className} strokeWidth={1.8} aria-hidden />;
}

/** A marca: uma Poké Ball desenhada, a mesma ideia do ícone do app. */
export function Pokebola({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="v2-pokebola-topo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a66" />
          <stop offset="1" stopColor="#d8213a" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="#f2f0f7" />
      <path d="M2 16a14 14 0 0 1 28 0Z" fill="url(#v2-pokebola-topo)" />
      <rect x="2" y="14.6" width="28" height="2.8" fill="#17161f" />
      <circle cx="16" cy="16" r="4.6" fill="#17161f" />
      <circle cx="16" cy="16" r="2.8" fill="#f2f0f7" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1" />
    </svg>
  );
}
