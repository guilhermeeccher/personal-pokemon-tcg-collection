import type { CSSProperties } from "react";

import estilos from "./inicio.module.css";

/**
 * O anel de progresso do início: um arco iridescente com o percentual no
 * centro, em CSS puro (`conic-gradient` com máscara), sem camada de
 * composição. É decorativo (`aria-hidden`): quem o usa escreve o número em
 * texto. O de `/colecoes` é do pacote que cuida daquela tela; este é o do
 * início, no mesmo desenho.
 */
export function Anel({ percentual, completo = false, tamanho = 54 }: { percentual: number; completo?: boolean; tamanho?: number }) {
  const estilo = { "--anel-p": percentual, "--anel-tamanho": `${tamanho}px` } as CSSProperties;
  return (
    <span className={estilos.anel} style={estilo} aria-hidden>
      <span className={[estilos.anelArco, completo ? estilos.anelCompleto : null].filter(Boolean).join(" ")} />
      <span className={`${estilos.anelRotulo} v2-num`}>{percentual}%</span>
    </span>
  );
}
