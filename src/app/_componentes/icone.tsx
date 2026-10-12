/**
 * Icone — único jeito de desenhar um glifo no projeto. Nenhuma tela escreve
 * `<svg>` à mão.
 *
 * Substitui o componente `Icon` do design system, que não sobreviveria aqui:
 * o original renderiza um `<span>` vazio e o popula num `useEffect` com
 * `innerHTML`, lendo `window.lucide` de um script UMD carregado por CDN. Sem
 * DOM no render do servidor, e sem o UMD presente ele falha *em silêncio* —
 * ícone vazio, nenhum erro. Aqui o glifo é um componente React de verdade,
 * importado do pacote `lucide-react`: renderiza no servidor, quebra o build
 * se o nome não existir, e entra no bundle só o que é usado.
 *
 * Para usar um glifo novo: importe-o do `lucide-react` e acrescente uma
 * linha no mapa `ICONES`. O `NomeIcone` se ajusta sozinho, e um nome errado
 * vira erro de tipo, não ícone invisível.
 *
 * Traço 1.75 e tamanhos 12/13/15/16/17/20 são a regra do design system; o
 * traço sobe para 2 nos glifos de 12px, que sumiriam com 1.75.
 */

import {
  BookOpen,
  ChartPie,
  ChevronRight,
  Circle,
  CirclePlus,
  Copy,
  Crown,
  Diamond,
  Gamepad2,
  Grid2x2,
  Inbox,
  Layers,
  LayoutGrid,
  Library,
  ListChecks,
  Lock,
  Medal,
  Menu,
  Search,
  Sparkles,
  Star,
  Tag,
  Trophy,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONES = {
  "book-open": BookOpen,
  "chart-pie": ChartPie,
  "chevron-right": ChevronRight,
  circle: Circle,
  "circle-plus": CirclePlus,
  copy: Copy,
  crown: Crown,
  diamond: Diamond,
  "gamepad-2": Gamepad2,
  "grid-2x2": Grid2x2,
  inbox: Inbox,
  layers: Layers,
  "layout-grid": LayoutGrid,
  library: Library,
  "list-checks": ListChecks,
  lock: Lock,
  medal: Medal,
  menu: Menu,
  search: Search,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  trophy: Trophy,
  x: X,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

export function Icone({
  nome,
  tamanho = 16,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  nome: NomeIcone;
  tamanho?: number;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const Glifo = ICONES[nome];
  return (
    <Glifo
      size={tamanho}
      strokeWidth={tamanho <= 12 ? 2 : 1.75}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
}
