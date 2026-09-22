import { ehImagemPropria } from "@/lib/dominio/imagem-local";

/**
 * URLs de imagem da TCGdex exigem sufixo de qualidade/formato — a URL
 * crua salva em `carta_catalogo.imagem_url` devolve 404 (confirmado ao
 * vivo em 2026-08-24). `low` (245x337, ~20KB) para grades com muitas
 * cartas; `high` (600x825, ~92KB) para detalhe/busca com poucos
 * resultados por vez.
 */
export function urlImagemCarta(
  imagemUrl: string | null,
  qualidade: "low" | "high" = "low",
): string | null {
  if (!imagemUrl) return null;
  // A imagem fornecida pelo usuário já É o arquivo final — a rota
  // `/api/imagens-locais/{cartaId}/{idioma}` devolve os bytes. Acrescentar
  // o sufixo de qualidade nela gera 404 e a carta some da tela, mostrando
  // ao mesmo tempo "+ foto" (a imagem falhou) e "trocar" (a imagem
  // existe). Foi exatamente o que aconteceu em 2026-08-26, na primeira
  // foto que o usuário subiu de verdade: o sufixo só vale para as URLs do CDN
  // da TCGdex, que são um prefixo e não um arquivo.
  if (ehImagemPropria(imagemUrl)) return imagemUrl;
  return `${imagemUrl}/${qualidade}.webp`;
}

/**
 * URL do sprite do Pokémon (PokeAPI/sprites, pixel art, ~0,5–1,7 KB),
 * usado só em vaga VAZIA de coleção Pokédex — nunca imagem de carta
 * (decisão de 2026-08-25: "quando for tipo pokedex tem que
 * ser só o nome ou a foto do pokemon porque não vou saber qual carta
 * vou querer colocar na dex" — mostrar uma carta específica seria
 * enganoso, qualquer carta daquele Pokémon serve). Construção de URL
 * pura a partir do número da vaga — sem sync, sem tabela, sem chamada
 * de API além do `<img>` em si; nada é persistido.
 */
export function urlSpritePokemon(numeroVaga: string): string | null {
  const n = Number(numeroVaga);
  if (!Number.isInteger(n) || n < 1) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}
