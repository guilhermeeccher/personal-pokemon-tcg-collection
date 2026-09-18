/**
 * ChipCondicao — a nota de conservação (NM → DMG).
 *
 * Os códigos nunca são traduzidos, e o nome completo em inglês vai no
 * `title`: é vocabulário de colecionador, e traduzir atrapalharia quem
 * compra e vende. Regra do design system, que aqui bate com a do projeto.
 */

import type { Condicao } from "@/lib/dominio/enums";

const MAPA: Record<Condicao, { completo: string; cor: string }> = {
  NM: { completo: "Near Mint", cor: "var(--cond-nm)" },
  LP: { completo: "Lightly Played", cor: "var(--cond-lp)" },
  MP: { completo: "Moderately Played", cor: "var(--cond-mp)" },
  HP: { completo: "Heavily Played", cor: "var(--cond-hp)" },
  DMG: { completo: "Damaged", cor: "var(--cond-dmg)" },
};

/** Cor da condição, para pintar a barra do recorte "Por condição". */
export function corCondicao(condicao: Condicao): string {
  return MAPA[condicao].cor;
}

export function ChipCondicao({ condicao }: { condicao: Condicao }) {
  const { completo, cor } = MAPA[condicao];
  return (
    <span
      title={completo}
      className="inline-flex h-5 items-center rounded-pill border px-2 font-mono text-[11px] font-medium tracking-[0.01em]"
      style={{
        borderColor: cor,
        color: cor,
        background: `color-mix(in oklab, ${cor} 10%, transparent)`,
      }}
    >
      {condicao}
    </span>
  );
}
