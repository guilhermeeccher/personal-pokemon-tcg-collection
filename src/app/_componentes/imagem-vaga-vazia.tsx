"use client";

/**
 * Imagem de vaga VAZIA — critério por tipo de coleção (decisão de
 * 2026-08-25), reaproveitado nas duas telas que mostram vaga
 * vazia (tela da coleção e "o que falta" consolidado — nunca diverge
 * entre elas, mesma regra aqui):
 *
 * - `set`: imagem da carta ESPERADA (já resolvida na Parte 1, join por
 *   `local_id`), esmaecida/em tons de cinza — a vaga é de uma carta
 *   específica, a imagem ajuda a reconhecer o que comprar. Usa o
 *   componente de zoom existente (`ImagemCartaComZoom`), mesma regra de
 *   "todo lugar onde imagem de carta aparece".
 * - `pokedex`: sprite do Pokémon (PokeAPI/sprites, URL determinística
 *   pelo número da vaga), NUNCA a imagem de uma carta — qualquer carta
 *   daquele número serve, mostrar uma específica seria enganoso (regra
 *   5: a escolha é sempre do usuário). Carregamento `lazy`; falha de
 *   rede ou número sem sprite degrada para nada — sem quadro quebrado,
 *   sem espaço vazio esquisito, sem erro no console.
 * - `customizada`: nunca tem vaga vazia (nasce preenchida) — devolve
 *   `null` por padrão, defensivo.
 */

import { useState } from "react";

import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import { urlSpritePokemon } from "@/lib/imagens";

export function ImagemVagaVazia({
  tipo,
  imagemUrl,
  imagemOrigem,
  chave,
  alt,
}: {
  tipo: TipoColecao;
  /** Da carta esperada — só populada para vaga vazia de coleção `set`. */
  imagemUrl: string | null;
  /** Procedência da imagem acima — repassada para o selo de foto emprestada. */
  imagemOrigem?: OrigemImagem | null;
  /** Número da Pokédex (coleção `pokedex`) — vira o sprite. */
  chave: string;
  alt: string;
}) {
  const [spriteFalhou, setSpriteFalhou] = useState(false);

  if (tipo === "set") {
    if (!imagemUrl) return null;
    return (
      <ImagemCartaComZoom
        imagemUrl={imagemUrl}
        origem={imagemOrigem}
        alt={alt}
        width={56}
        height={77}
        className="rounded-sm opacity-40 grayscale"
      />
    );
  }

  if (tipo === "pokedex") {
    const url = urlSpritePokemon(chave);
    if (!url || spriteFalhou) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, pixel art ~1KB); não é imagem de carta, não passa pelo componente de zoom.
      <img
        src={url}
        alt={alt}
        width={56}
        height={56}
        loading="lazy"
        className="opacity-70"
        onError={() => setSpriteFalhou(true)}
      />
    );
  }

  return null;
}
