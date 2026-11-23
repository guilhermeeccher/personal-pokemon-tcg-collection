/**
 * As URLs que a Carta da v2 carrega. Módulo puro.
 *
 * Qual foto exibir **não** é decidido aqui: a cadeia de procedência — foto
 * própria > catálogo do idioma > mypcards > empréstimo do outro idioma
 * ocidental > palpite de CDN (só japonês) — é resolvida em SQL
 * (`imagemDaCarta`/`origemDaImagem`, em `lib/db/consultas.ts`), que entrega
 * a URL já escolhida e a origem dela. É a mesma regra da v1
 * (`imagem-carta-zoom.tsx`); a Carta só exibe.
 *
 * O que resta decidir é a qualidade:
 *
 * - `base` é sempre a `low.webp` (245×337, ~0,3 MiB decodificada). É o que
 *   a grade mostra, e o que o detalhe mostra **até** a grande estar pronta.
 * - `alvo` é a qualidade pedida. Com `high` (600×825, ~1,9 MiB decodificada)
 *   a Carta decodifica a grande à parte e só então troca (`decode()` antes
 *   de trocar), para não piscar vazio no meio da troca.
 *
 * Foto própria e scan do mypcards já são o arquivo final
 * (`/api/imagens-locais/...`): `urlImagemCarta` devolve a mesma URL nas duas
 * qualidades, e aí não há troca nenhuma.
 */

import { urlImagemCarta } from "@/lib/imagens";

export type QualidadeImagem = "low" | "high";

export interface FontesImagem {
  base: string | null;
  alvo: string | null;
  /** Há uma imagem melhor para carregar depois da base. */
  trocaDepois: boolean;
}

export function fontesDaImagem(imagemUrl: string | null, qualidade: QualidadeImagem): FontesImagem {
  const base = urlImagemCarta(imagemUrl, "low");
  const alvo = urlImagemCarta(imagemUrl, qualidade);
  return { base, alvo, trocaDepois: alvo !== null && alvo !== base };
}
