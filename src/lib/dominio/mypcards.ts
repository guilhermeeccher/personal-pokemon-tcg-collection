/**
 * mypcards — fonte secundária de foto de carta, para o que a TCGdex não
 * digitalizou.
 *
 * Por que existe: 620 linhas do catálogo continuam sem foto depois do
 * empréstimo pt↔en (ver `origem-imagem.ts`), e para elas não há fonte
 * oficial nenhuma — nem em português, nem em inglês. São sets inteiros
 * que a TCGdex não escaneou: energias, promos e galerias. O caso que
 * originou isto são as 10 energias de Megaevolução.
 *
 * ## O formato da URL
 *
 * Decomposto a partir de um link que ele mandou, e conferido campo a
 * campo contra o CDN deles em 2026-08-29:
 *
 *     https://img.mypcards.com/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg
 *                                  │ │    └── código do set + número da carta
 *                                  │ └────── id do set no catálogo DELES
 *                                  └──────── constante
 *
 * O que foi confirmado por medição:
 * - **O código do set e o número da carta são os nossos**: `mee` + `004`
 *   casam com `set_id` + `local_id` do nosso catálogo, sem tradução.
 * - **`_pt` e `_en` existem; `_jp` não** — o site é brasileiro e não
 *   publica o japonês. Por isso `idiomaSuportado` recusa `jp` em vez de
 *   montar uma URL que sempre daria 404.
 * - **O id do set é obrigatório e específico**: trocar 2370 por qualquer
 *   outro número dá 404. Ele não é derivável do nosso catálogo — é
 *   interno deles.
 * - O prefixo opcional `/cdn-cgi/image/<opções>/` é o redimensionador do
 *   Cloudflare. Sem ele vem o original (733×1024, ~114 KB); com
 *   `h=425` vem ~19 KB, que é mais que suficiente para a miniatura e a
 *   ampliação de 280px — e é o que baixamos, para não inchar o volume
 *   de imagens nem o backup dele.
 *
 * ## Por que o id do set é COLADO, e não descoberto
 *
 * As páginas do site estão atrás do challenge do Cloudflare: `curl` e
 * qualquer cliente que não seja navegador levam 403, então não dá para
 * ler o número de lá automaticamente. Descobrir por varredura custaria
 * ~2.400 requisições por set (o número é opaco e os sets antigos estão em
 * faixas baixas e desconhecidas) — foi assim, martelando, que o IP deste
 * servidor levou bloqueio da TCGdex em agosto, e não se repete o erro.
 *
 * Então o mapeamento entra por gesto humano: o usuário abre o set no
 * navegador, copia o endereço de qualquer imagem e cola. Um paste
 * resolve o set inteiro, e só para set que ele de fato quer.
 */

import type { Idioma } from "./enums";
import { type Recusa, recusa } from "./recusa";

/** Host do CDN de imagens deles. O site (`www`) não é usado por nós. */
export const HOST_IMAGENS_MYPCARDS = "img.mypcards.com";

/**
 * Opções do redimensionador do Cloudflare. `h=425` cobre a ampliação de
 * 280px com folga; `f=auto` deixa o CDN escolher webp quando o cliente
 * aceita (o validador de assinatura aceita jpeg, png e webp).
 */
const OPCOES_REDIMENSIONAMENTO = "h=425,fit=contain,f=auto";

/**
 * Só pt e en. O japonês não é omissão: o site não publica `_jp`
 * (conferido no set `mee`, 404), e montar a URL mesmo assim geraria uma
 * requisição perdida por carta.
 */
export function idiomaSuportado(idioma: Idioma): idioma is "pt" | "en" {
  return idioma === "pt" || idioma === "en";
}

export interface ReferenciaMypcards {
  /** Id do set no catálogo deles — o número opaco que só o paste revela. */
  numeroSet: number;
  /** Código do set, no nosso formato (`mee`). */
  setId: string;
  /** Número da carta, como impresso (`004`) — zeros à esquerda preservados. */
  localId: string;
  idioma: "pt" | "en";
}

/**
 * Lê uma URL de imagem do mypcards e devolve as partes, ou `null` se não
 * for uma URL desse formato.
 *
 * Aceita as duas formas (com e sem o prefixo do redimensionador) porque
 * as duas aparecem no site — a que o navegador mostra é a redimensionada,
 * e é ela que o usuário vai copiar na prática.
 */
export function lerUrlMypcards(valor: string): ReferenciaMypcards | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.hostname !== HOST_IMAGENS_MYPCARDS) return null;

  // O prefixo do redimensionador tem número variável de segmentos, então
  // a âncora é o `/img/`, não a posição absoluta.
  const segmentos = url.pathname.split("/").filter(Boolean);
  const i = segmentos.indexOf("img");
  if (i === -1) return null;

  // .../img/<constante>/<numeroSet>/<pasta>/<arquivo>
  const numeroSetTexto = segmentos[i + 2];
  const arquivo = segmentos[i + 4];
  if (!numeroSetTexto || !arquivo) return null;

  if (!/^\d+$/.test(numeroSetTexto)) return null;
  const numeroSet = Number(numeroSetTexto);

  // pokemon_<set>_<localId>_<idioma>.<ext> — o set pode conter `.`
  // (`swsh4.5sv`), então o corte é pelas pontas, nunca por split simples.
  const semExtensao = arquivo.replace(/\.[a-z0-9]+$/i, "");
  const casamento = /^pokemon_(.+)_([^_]+)_(pt|en)$/.exec(semExtensao);
  if (!casamento) return null;

  return {
    numeroSet,
    setId: casamento[1],
    localId: casamento[2],
    idioma: casamento[3] as "pt" | "en",
  };
}

/**
 * Monta a URL da imagem de uma carta, já redimensionada.
 *
 * Não valida se o arquivo existe — isso só se sabe com a requisição, e
 * quem faz é o script de download.
 */
export function urlImagemMypcards({
  numeroSet,
  setId,
  localId,
  idioma,
}: ReferenciaMypcards): string {
  const pasta = `pokemon_${setId}_${localId}`;
  return (
    `https://${HOST_IMAGENS_MYPCARDS}/cdn-cgi/image/${OPCOES_REDIMENSIONAMENTO}` +
    `/img/2/${numeroSet}/${pasta}/${pasta}_${idioma}.jpg`
  );
}

export type ErroMapeamentoSet =
  | { ok: false; erro: Recusa }
  | { ok: true; referencia: ReferenciaMypcards };

/**
 * Valida um link colado pelo usuário para mapear um set.
 *
 * O `setIdEsperado` é conferido de propósito: colar o link de um set
 * enquanto se olha outro gravaria um número errado, e o sintoma seria
 * "todas as cartas do set ficaram 404" — barato de evitar aqui, caro de
 * diagnosticar depois.
 */
export function validarLinkMapeamentoSet(
  valor: string,
  setIdEsperado: string,
): ErroMapeamentoSet {
  const referencia = lerUrlMypcards(valor.trim());
  if (!referencia) {
    return { ok: false, erro: recusa("linkNaoEhMypcards") };
  }
  if (referencia.setId !== setIdEsperado) {
    return {
      ok: false,
      erro: recusa("linkDeOutroSet", {
        link: referencia.setId,
        esperado: setIdEsperado,
      }),
    };
  }
  return { ok: true, referencia };
}
