/**
 * O que a tabela de preços da v2 precisa de cada carta da página para mostrá-la
 * e abri-la: a foto (a mesma cadeia de procedência do resto do app) e a cópia
 * pela qual o detalhe abre (`copiasRepresentantes`).
 *
 * A linha de catálogo que representa a carta é a da própria tabela de preços:
 * pt, senão en, senão jp (`fichasDeExibicao`) — a foto e o nome vêm da mesma
 * linha. Duas leituras com `inArray`, limitadas aos ids pedidos (uma página);
 * nunca varre o catálogo nem o inventário. Só `select`.
 */

import { inArray } from "drizzle-orm";

import type { CartaDaTabelaDTO } from "@/lib/dominio/precos-v2";

import type { Database } from "./client";
import { imagemDaCarta, origemDaImagem } from "./consultas";
import { copiasRepresentantes } from "./copia-representante";
import { cartaCatalogo } from "./schema";

const ORDEM_IDIOMA = { pt: 0, en: 1, jp: 2 } as const;

export async function lerCartasDaTabelaPrecos(
  db: Database,
  cartaIds: readonly string[],
): Promise<CartaDaTabelaDTO[]> {
  if (cartaIds.length === 0) return [];
  const [linhas, copiaPorCarta] = await Promise.all([
    db
      .select({
        cartaId: cartaCatalogo.id,
        idioma: cartaCatalogo.idioma,
        imagemUrl: imagemDaCarta(cartaCatalogo),
        imagemOrigem: origemDaImagem(cartaCatalogo),
      })
      .from(cartaCatalogo)
      .where(inArray(cartaCatalogo.id, [...cartaIds])),
    copiasRepresentantes(db, cartaIds),
  ]);

  const escolhida = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) {
    const atual = escolhida.get(l.cartaId);
    if (!atual || ORDEM_IDIOMA[l.idioma] < ORDEM_IDIOMA[atual.idioma]) escolhida.set(l.cartaId, l);
  }

  // Na ordem pedida; uma carta fora do catálogo não entra (a tabela de preços
  // também a descarta: `listarPrecos` só devolve quem tem ficha).
  return cartaIds.flatMap((cartaId) => {
    const l = escolhida.get(cartaId);
    if (!l) return [];
    return [
      {
        cartaId,
        copiaId: copiaPorCarta.get(cartaId) ?? null,
        imagemUrl: l.imagemUrl,
        imagemOrigem: l.imagemOrigem,
      },
    ];
  });
}
