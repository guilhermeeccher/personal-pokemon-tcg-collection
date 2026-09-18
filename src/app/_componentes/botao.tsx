/**
 * Botao — três variantes (primário/secundário/perigo) e três tamanhos,
 * consumindo os tokens de `globals.css`. Extraído dos botões repetidos
 * (e divergentes em detalhe) em todas as telas: "Gravar lote", "Nova
 * coleção", "Salvar", "Cancelar", "Excluir", "Remover" etc.
 *
 * Forma vem do design system: tudo em pílula, e o primário carrega o
 * `--shadow-chunky` — um lábio sólido de 3px embaixo, que some no clique
 * enquanto o botão afunda (`translateY(2px) scale(.98)`). É o "chunky
 * pressable" que o sistema usa para o botão parecer um objeto físico.
 * O hover sobe 1px; nada disso anima sob `prefers-reduced-motion`, porque
 * as durações do design system zeram sozinhas nesse modo.
 *
 * `classesBotao` é exportado à parte para os poucos casos em que o
 * botão precisa ser um <Link>/<a> (download de CSV, navegação estilizada
 * como botão) — mesma aparência, sem forçar um <button> onde a semântica
 * correta é link.
 */

import type { ButtonHTMLAttributes } from "react";

export type VarianteBotao = "primario" | "secundario" | "perigo";
export type TamanhoBotao = "md" | "sm" | "xs";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill font-bold tracking-[0.01em] whitespace-nowrap [transition:var(--transition-control)] hover:-translate-y-px active:translate-y-0.5 active:scale-[.98] active:shadow-none disabled:pointer-events-none disabled:border-transparent disabled:bg-inset disabled:text-subtle disabled:shadow-none";

const VARIANTES: Record<VarianteBotao, string> = {
  primario: "bg-accent text-accent-fg shadow-chunky hover:bg-accent-hover",
  secundario: "border border-line bg-surface text-foreground shadow-1 hover:bg-surface-hover",
  perigo: "border border-danger/40 text-danger-fg hover:bg-danger-soft",
};

/* Alturas fixas do design system (--control-h-sm/-h/-lg). Botão de linha de
   tabela e de barra de ação ficam alinhados sem cada tela calibrar padding. */
const TAMANHOS: Record<TamanhoBotao, string> = {
  md: "h-[34px] px-5 text-[13px]",
  sm: "h-[28px] px-4 text-xs",
  xs: "h-6 px-3 text-[11px]",
};

export function classesBotao(
  variante: VarianteBotao = "secundario",
  tamanho: TamanhoBotao = "md",
  className = "",
): string {
  return `${BASE} ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`;
}

export function Botao({
  variante = "secundario",
  tamanho = "md",
  className = "",
  ...props
}: {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={classesBotao(variante, tamanho, className)} {...props} />;
}
