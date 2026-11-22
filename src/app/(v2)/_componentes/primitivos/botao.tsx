import Link from "next/link";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

import estilos from "./botao.module.css";

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo" | "iris";

interface PropsComuns {
  variante?: VarianteBotao;
  /** 36 px de desenho a partir de 768 px; abaixo, 44 como os outros. */
  pequeno?: boolean;
  /** Ocupa a largura do contêiner (rodapé de uma folha no celular). */
  largo?: boolean;
  /** Só ícone: botão redondo de 44 px. Exige `aria-label`. */
  soIcone?: boolean;
  /** Mostra o giro e desliga o botão; `aria-busy` diz por quê. */
  carregando?: boolean;
  icone?: ReactNode;
  children?: ReactNode;
}

function classes({ variante = "secundario", pequeno, largo, soIcone }: PropsComuns, extra?: string): string {
  return [
    estilos.botao,
    estilos[variante],
    variante === "iris" ? "v2-anima" : null,
    pequeno ? estilos.pequeno : null,
    largo ? estilos.largo : null,
    soIcone ? estilos.icone : null,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export type PropsBotao = PropsComuns & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/**
 * O botão da v2. `type="button"` por padrão: um botão dentro de um `<form>`
 * que não diz o tipo envia o formulário, e quase nenhum botão desta interface
 * é de envio.
 */
export const Botao = forwardRef<HTMLButtonElement, PropsBotao>(function Botao(
  { variante, pequeno, largo, soIcone, carregando = false, icone, children, className, disabled, type = "button", ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes({ variante, pequeno, largo, soIcone }, className)}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? <span className={estilos.giro} aria-hidden /> : icone}
      {children}
    </button>
  );
});

/**
 * Um link com cara de botão (navegação, nunca ação). Pode apontar para uma
 * tela que ainda é ponte: o link já está certo quando a tela da v2 chegar.
 */
export function BotaoLink({
  href,
  variante,
  pequeno,
  largo,
  soIcone,
  icone,
  children,
  className,
  ...resto
}: PropsComuns & { href: string; className?: string; "aria-label"?: string; "aria-current"?: "page" }) {
  return (
    <Link href={href} className={classes({ variante, pequeno, largo, soIcone }, className)} {...resto}>
      {icone}
      {children}
    </Link>
  );
}
