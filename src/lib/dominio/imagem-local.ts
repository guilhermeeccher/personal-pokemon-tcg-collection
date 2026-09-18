/**
 * Regras puras da imagem local de uma carta (tarefa "carta sem foto",
 * 2026-08-26): quais tipos de arquivo aceitamos, qual o tamanho máximo, e
 * como decidir o tipo real de um arquivo a partir dos seus bytes — nunca
 * pela extensão do nome enviado nem pelo `Content-Type` declarado, os
 * dois são fáceis de forjar. Módulo puro, sem I/O — testável sem disco
 * nem rede.
 */

export const TIPOS_MIME_IMAGEM_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type TipoMimeImagemPermitido =
  (typeof TIPOS_MIME_IMAGEM_PERMITIDOS)[number];

/** ~8 MB — limite pedido na tarefa. */
export const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024;

const EXTENSAO_POR_MIME: Record<TipoMimeImagemPermitido, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensaoParaMime(mime: TipoMimeImagemPermitido): string {
  return EXTENSAO_POR_MIME[mime];
}

/**
 * Detecta o tipo real de uma imagem pelos primeiros bytes do arquivo
 * (assinatura/"magic number"), não pela extensão do nome nem pelo
 * `Content-Type` que o cliente declarou — ambos podem mentir. Devolve
 * `null` quando os bytes não casam com nenhuma das três assinaturas
 * aceitas (arquivo não é imagem, ou é um formato não suportado).
 *
 * Assinaturas:
 * - JPEG: `FF D8 FF`.
 * - PNG: `89 50 4E 47 0D 0A 1A 0A`.
 * - WEBP: contêiner RIFF (`52 49 46 46` + tamanho de 4 bytes) com a tag
 *   `WEBP` (`57 45 42 50`) no offset 8 — o tamanho no meio é variável,
 *   por isso os dois trechos são checados separados, não como uma
 *   assinatura contígua.
 */
export function detectarTipoImagemPorAssinatura(
  bytes: Uint8Array,
): TipoMimeImagemPermitido | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const assinaturaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= assinaturaPng.length &&
    assinaturaPng.every((byte, i) => bytes[i] === byte)
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export interface ResultadoValidacaoArquivoImagem {
  ok: boolean;
  erro?: string;
  tipo?: TipoMimeImagemPermitido;
}

/**
 * Valida um arquivo candidato a imagem local: tamanho e conteúdo real
 * (via assinatura). Único ponto de decisão usado tanto pelo upload
 * direto quanto pelo download por URL — as duas formas de entrada caem
 * no mesmo arquivo de bytes antes de chegar aqui.
 */
export function validarArquivoImagem(bytes: Uint8Array): ResultadoValidacaoArquivoImagem {
  if (bytes.length === 0) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  if (bytes.length > TAMANHO_MAXIMO_BYTES) {
    return {
      ok: false,
      erro: `Arquivo maior que o limite de ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)} MB.`,
    };
  }
  const tipo = detectarTipoImagemPorAssinatura(bytes);
  if (!tipo) {
    return {
      ok: false,
      erro: "Arquivo não reconhecido como imagem JPEG, PNG ou WEBP (checado pelo conteúdo, não pela extensão).",
    };
  }
  return { ok: true, tipo };
}

export interface ResultadoValidacaoUrlOrigem {
  ok: boolean;
  erro?: string;
}

/**
 * Valida a URL colada pelo usuário antes de o servidor tentar baixá-la:
 * só `http`/`https` — nunca `file:`, `ftp:` ou qualquer outro esquema que
 * pudesse ser usado para ler algo que não é uma imagem na web.
 */
export function validarUrlOrigem(valor: string): ResultadoValidacaoUrlOrigem {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return { ok: false, erro: "URL inválida." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, erro: "Só URLs http:// ou https:// são aceitas." };
  }
  return { ok: true };
}

/**
 * Prefixo da URL que o servidor devolve quando a carta tem imagem
 * fornecida pelo usuário (ver `imagemComFallbackCdn` em
 * `lib/db/consultas.ts`). Vive aqui para a tela não precisar comparar a
 * string solta em vários lugares.
 */
export const PREFIXO_URL_IMAGEM_PROPRIA = "/api/imagens-locais/";

/**
 * A imagem exibida é uma que o usuário forneceu (e portanto pode ser
 * trocada ou removida), ou veio do catálogo/CDN?
 *
 * Distinção que importa na interface: imagem do catálogo não é dele para
 * mexer; a que ele enviou, sim.
 */
export function ehImagemPropria(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(PREFIXO_URL_IMAGEM_PROPRIA);
}
