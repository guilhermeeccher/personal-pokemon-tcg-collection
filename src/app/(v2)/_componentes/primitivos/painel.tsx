import type { ElementType, HTMLAttributes, ReactNode } from "react";

import estilos from "./painel.module.css";

export type TomPainel = "neutro" | "iris" | "sucesso" | "alerta" | "perigo";

/**
 * Painel: o cartão interno da v2 (`.v2-painel` de `v2.css`) — fundo
 * translúcido e aresta, **sem desfoque**. É o nível que pode repetir numa
 * tela inteira; vidro com desfoque é só para a casca e o véu de uma janela.
 */
export function Painel({
  as: Tag = "div",
  tom = "neutro",
  compacto = false,
  className,
  children,
  ...resto
}: {
  as?: ElementType;
  tom?: TomPainel;
  compacto?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const classe = [
    "v2-painel",
    estilos.painel,
    tom !== "neutro" ? estilos[tom] : null,
    compacto ? estilos.compacto : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classe} {...resto}>
      {children}
    </Tag>
  );
}

/**
 * Aviso em linha, dentro da tela (não flutuante): um painel com tom, ícone,
 * título e texto, e uma ação opcional à direita. Para recado passageiro, o
 * aviso flutuante (`aviso-flutuante.tsx`).
 */
export function AvisoEmLinha({
  tom = "neutro",
  icone,
  titulo,
  acao,
  children,
  papel,
}: {
  tom?: TomPainel;
  icone?: ReactNode;
  titulo?: ReactNode;
  acao?: ReactNode;
  children?: ReactNode;
  /** `alert` só para erro que acabou de acontecer; o padrão é texto comum. */
  papel?: "alert" | "status";
}) {
  return (
    <Painel tom={tom} compacto className={estilos.aviso} role={papel}>
      {icone}
      <div className={estilos.avisoTexto}>
        {titulo && <b className={estilos.avisoTitulo}>{titulo}</b>}
        {children}
      </div>
      {acao}
    </Painel>
  );
}
