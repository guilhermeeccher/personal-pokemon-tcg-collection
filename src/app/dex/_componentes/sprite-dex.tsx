import { urlSpriteDex } from "@/lib/imagens";

/** Sprite pequeno da PokeAPI (pixel art, ~0,6 KB), carregado do CDN na hora. */
export function SpriteDex({
  sprite,
  shiny,
  tamanho,
  apagado = false,
  alt = "",
}: {
  sprite: string;
  shiny: boolean;
  tamanho: number;
  apagado?: boolean;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno, centenas por tela; next/image não ajuda aqui.
    <img
      src={urlSpriteDex(sprite, shiny)}
      alt={alt}
      width={tamanho}
      height={tamanho}
      loading="lazy"
      className={apagado ? "opacity-40 grayscale" : ""}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function nomeDaForma(f: { especie: string; forma: string | null }): string {
  return f.forma ? `${f.especie} (${f.forma})` : f.especie;
}
