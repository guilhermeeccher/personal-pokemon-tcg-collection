/**
 * Qual efeito de luz a Carta da v2 mostra. Módulo puro.
 *
 * São cinco efeitos, os do protótipo de 2026-11-22:
 *
 * - `normal` — sem efeito de superfície; só o brilho que segue o ponteiro.
 * - `reverse` — purpurina e arco-íris em tudo, **menos** na janela da
 *   ilustração (é assim que a reverse foil é impressa).
 * - `holo` — arco-íris **só** na janela da ilustração.
 * - `ilustracao` — ilustração rara: arte cheia, textura gravada na carta
 *   inteira.
 * - `hiper` — hiper rara: ouro com purpurina.
 *
 * ## De onde vem
 *
 * Os dois primeiros sinais são da **raridade da carta** e vencem a variante:
 * ilustração rara e hiper rara são acabamentos da própria impressão, que
 * não existem em versão "normal" ou "reverse". A raridade é texto livre do
 * upstream, em dois idiomas ("Illustration rare", "Ilustração Rara
 * Especial", "Hyper rare", "Mega Hiper Raro"), comparada sem acento e sem
 * caixa.
 *
 * Fora isso, quem decide é a **variante da cópia** (`variante_copia`), que
 * descreve a carta física que o usuário tem (regra 7: a cópia diz como é a
 * minha). `normal`, `reverse` e `holo` são acabamentos e passam direto.
 * `primeira_edicao` e `promo` **não** são acabamento — são um selo e uma
 * origem, e existem em cartas holo e não holo — então, para elas e para a
 * carta sem cópia (vaga vazia, carta do catálogo), o acabamento sai da
 * classe de raridade: `holo` e `secreta` (`classificarRaridade`) brilham
 * como holo, o resto é normal. Nunca se inventa reverse: sem a cópia dizer,
 * não há como saber.
 *
 * O efeito é **realce**: a variante também sai em texto (o componente
 * escreve o rótulo dela), e nada depende de ver o brilho.
 *
 * A escada de melhoria da vaga (regra 8, `melhoria-vaga.ts`) não lê nada
 * daqui: o efeito é só visual.
 */

import type { VarianteCopia } from "@/lib/dominio/enums";
import { classificarRaridade } from "@/lib/dominio/raridade-visual";

export const EFEITOS_CARTA = ["normal", "reverse", "holo", "ilustracao", "hiper"] as const;
export type EfeitoCarta = (typeof EFEITOS_CARTA)[number];

/** Minúsculas e sem acento, como `raridade-visual.ts`. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function efeitoDaCarta({
  variante,
  raridade,
}: {
  /** A variante da cópia física; `null` quando não há cópia. */
  variante: VarianteCopia | null | undefined;
  /** A raridade da linha do catálogo, como veio do upstream. */
  raridade: string | null | undefined;
}): EfeitoCarta {
  const r = raridade ? normalizar(raridade) : "";
  if (r.includes("hiper") || r.includes("hyper")) return "hiper";
  if (r.includes("ilustracao") || r.includes("illustration")) return "ilustracao";
  switch (variante) {
    case "normal":
    case "reverse":
    case "holo":
      return variante;
    case "primeira_edicao":
    case "promo":
    case null:
    case undefined: {
      const classe = classificarRaridade(raridade);
      return classe === "holo" || classe === "secreta" ? "holo" : "normal";
    }
  }
}
