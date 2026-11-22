import type { CSSProperties } from "react";

import estilos from "./colecoes.module.css";

/**
 * O anel de progresso do cartão: um arco iridescente com o percentual no
 * centro. CSS puro (`conic-gradient` com máscara), sem JavaScript nem camada
 * de composição. O arco cresce uma vez ao aparecer (`--v2-anel-fator`, de 0 a
 * 1); com movimento reduzido a animação salta para o fim, e o estado final é o
 * mesmo. O número também está em texto: a cor do arco só reforça.
 *
 * `percentual` já vem de `progressoDaColecao`: 100 só quando nada falta.
 */
export function AnelProgresso({ percentual, completo }: { percentual: number; completo: boolean }) {
  const arco = { "--v2-anel-p": percentual } as CSSProperties;
  return (
    <div className={estilos.anel} aria-hidden>
      <span className={[estilos.anelArco, completo ? estilos.anelCompleto : null].filter(Boolean).join(" ")} style={arco} />
      <span className={estilos.anelRotulo}>{percentual}%</span>
    </div>
  );
}

/** Customizada: sem denominador, o círculo só leva a contagem. */
export function ContagemEmCirculo({ quantas }: { quantas: number }) {
  return (
    <div className={`${estilos.anel} ${estilos.contagemCirculo}`} aria-hidden>
      <span className={estilos.anelRotulo}>{quantas}</span>
    </div>
  );
}
