import { urlSpriteDex } from "@/lib/imagens";

import estilos from "./dex.module.css";

/**
 * Sprite pequeno da PokeAPI (pixel art, ~0,6 KB), carregado do CDN na hora,
 * nunca guardado no repositório (AGENTS.md, "Sprites come from the PokeAPI
 * sprites CDN"). Peça compartilhada da Dex na v2 (dono: pacote 5a; usam 5a,
 * 5c, 5d e 5e — `docs/design-v2/rules.md`, "Dex shared code").
 *
 * - `<img>` simples, nunca `next/image`: são centenas por tela, já minúsculos,
 *   e o otimizador só aceita uma URL absoluta da TCGdex.
 * - `apagado`: a vaga em falta (ou sem shiny) aparece em cinza. É realce, não
 *   informação: quem usa escreve o estado em texto também (regra 1 da v2).
 * - `alt` vazio por padrão: quase sempre o nome já está ao lado, ou no
 *   `aria-label` do botão que contém o sprite.
 */
export function SpriteDex({
  sprite,
  shiny,
  tamanho,
  apagado = false,
  alt = "",
  className,
}: {
  sprite: string;
  shiny: boolean;
  tamanho: number;
  apagado?: boolean;
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno, centenas por tela; next/image não ajuda aqui.
    <img
      src={urlSpriteDex(sprite, shiny)}
      alt={alt}
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={[estilos.sprite, apagado ? estilos.apagado : null, className].filter(Boolean).join(" ")}
    />
  );
}
