/**
 * ChipVariante — a variante da cópia como pílula com ponto colorido.
 *
 * O design system só desenhou três variantes (normal/reverse/holo), mas o
 * enum real do sistema tem cinco: `primeira_edicao` e `promo` também são
 * cópias que o usuário pode possuir, e ficariam sem como aparecer. As duas
 * cores novas saem da própria paleta do design system — caramelo para
 * primeira edição, rosa para promo — para não inventar cor fora do sistema.
 *
 * Os três rótulos originais seguem em inglês minúsculo, como o design
 * system pede: é como colecionador escreve. Os dois novos ficam em
 * português, porque é como o domínio do sistema já os chama.
 */

import type { VarianteCopia } from "@/lib/dominio/enums";

const MAPA: Record<VarianteCopia, { rotulo: string; cor: string; fundo: string }> = {
  normal: { rotulo: "normal", cor: "var(--variant-normal)", fundo: "var(--variant-normal-bg)" },
  reverse: { rotulo: "reverse", cor: "var(--variant-reverse)", fundo: "var(--variant-reverse-bg)" },
  holo: { rotulo: "holo", cor: "var(--variant-holo)", fundo: "var(--variant-holo-bg)" },
  primeira_edicao: { rotulo: "1ª edição", cor: "var(--caramel-3)", fundo: "var(--caramel-1)" },
  promo: { rotulo: "promo", cor: "var(--rose-2)", fundo: "var(--rose-1)" },
};

/** Cor da variante, para pintar a barra do recorte "Por variante". */
export function corVariante(variante: VarianteCopia): string {
  return MAPA[variante].cor;
}

export function ChipVariante({
  variante,
  tamanho = "md",
}: {
  variante: VarianteCopia;
  tamanho?: "sm" | "md";
}) {
  const { rotulo, cor, fundo } = MAPA[variante];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2 font-mono font-medium ${
        tamanho === "sm" ? "h-5 text-[11px]" : "h-6 text-xs"
      }`}
      style={{ background: fundo, color: `color-mix(in oklab, ${cor} 78%, var(--ink-1))` }}
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-pill" style={{ background: cor }} />
      {rotulo}
    </span>
  );
}
