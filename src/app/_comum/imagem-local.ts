/**
 * Os pedidos da foto própria de uma carta, sem pele: qual rota, qual método,
 * qual corpo, e o que falta antes de enviar. A pele (a janela da v1 em
 * `_componentes/adicionar-imagem-local.tsx`, a seção do detalhe de carta da
 * v2) só desenha os campos e chama `fetch` com o que sai daqui.
 *
 * As regras são as da v1, sem mudança:
 *
 * - **A foto é da ficha do catálogo, não da cópia física.** A rota é
 *   `/api/imagens-locais/<cartaId>/<idioma>` com o idioma **do catálogo**:
 *   uma vez enviada, toda cópia daquela ficha passa a mostrá-la (a foto
 *   própria vence a cadeia de procedência em `imagemDaCarta`).
 * - **Três modos.** Arquivo (multipart, campo `arquivo`), link (multipart,
 *   campo `url`, que o servidor baixa) e o mapeamento do set no MyPCards
 *   (`POST /api/sets-mypcards` com `{ setId, url }`), que resolve o set
 *   inteiro de uma vez e baixa o que falta em segundo plano.
 * - **Só a foto própria se remove** (`DELETE` na mesma rota): a do catálogo
 *   não é da pessoa para mexer.
 * - **O set vem de quem chama, nunca cortado do `cartaId`**: id de set tem
 *   ponto e dígito (`swsh4.5`, `sv03.5`), e cortar erraria o set.
 *
 * Fica em `_comum/` porque é a parte da foto própria que as duas versões
 * podem usar (`docs/design-v2/rules.md`, regra 16): a v2 não importa a
 * janela da v1, e a lógica não é copiada para dentro da pele nova.
 */

import type { Idioma } from "@/lib/dominio/enums";

export type ModoImagemLocal = "arquivo" | "link" | "mypcards";

/** O que falta antes de enviar; a pele traduz (`imagemLocal.<chave>` na v1, `v2Detalhe.foto.<chave>` na v2). */
export type FaltaNaImagemLocal = "erroEscolhaArquivo" | "erroColeLink" | "erroColeMypcards" | "semSet";

export interface PedidoImagemLocal {
  url: string;
  init: { method: "POST" | "DELETE"; body?: FormData | string; headers?: Record<string, string> };
}

export function rotaDaImagemLocal(cartaId: string, idiomaCatalogo: Idioma): string {
  return `/api/imagens-locais/${encodeURIComponent(cartaId)}/${idiomaCatalogo}`;
}

export function pedidoDeEnvio(
  modo: ModoImagemLocal,
  e: { cartaId: string; idiomaCatalogo: Idioma; setId?: string | null; arquivo: File | null; link: string },
): { ok: true; pedido: PedidoImagemLocal } | { ok: false; falta: FaltaNaImagemLocal } {
  const link = e.link.trim();
  if (modo === "mypcards") {
    if (!e.setId) return { ok: false, falta: "semSet" };
    if (link === "") return { ok: false, falta: "erroColeMypcards" };
    return {
      ok: true,
      pedido: {
        url: "/api/sets-mypcards",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId: e.setId, url: link }),
        },
      },
    };
  }

  const dados = new FormData();
  if (modo === "arquivo") {
    if (!e.arquivo) return { ok: false, falta: "erroEscolhaArquivo" };
    dados.set("arquivo", e.arquivo);
  } else {
    if (link === "") return { ok: false, falta: "erroColeLink" };
    dados.set("url", link);
  }
  return { ok: true, pedido: { url: rotaDaImagemLocal(e.cartaId, e.idiomaCatalogo), init: { method: "POST", body: dados } } };
}

export function pedidoDeRemocao(cartaId: string, idiomaCatalogo: Idioma): PedidoImagemLocal {
  return { url: rotaDaImagemLocal(cartaId, idiomaCatalogo), init: { method: "DELETE" } };
}
