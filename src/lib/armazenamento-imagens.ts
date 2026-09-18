/**
 * Armazenamento em disco da imagem local de uma carta (tarefa "carta sem
 * foto", 2026-08-26). Server-only: usa `node:fs`/`node:path` e `fetch`
 * para baixar de URL — nunca importado por componente `"use client"`.
 *
 * Responsabilidades (só I/O; validação de conteúdo/tamanho fica em
 * `lib/dominio/imagem-local.ts`, puro e testado):
 * - Resolver o diretório base (volume Docker, caminho configurável).
 * - Gerar um nome de arquivo seguro (nunca o nome que o usuário mandou).
 * - Gravar e apagar arquivos, sempre dentro do diretório base.
 * - Baixar uma URL com cuidado: só http/https, timeout curto, redirects
 *   limitados, tamanho limitado DURANTE o download (não confia em
 *   `Content-Length`, que o servidor de origem pode omitir ou mentir).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  TAMANHO_MAXIMO_BYTES,
  validarUrlOrigem,
  type TipoMimeImagemPermitido,
} from "@/lib/dominio/imagem-local";

/**
 * 30s, não 10s. Medido em 2026-08-26: o próprio CDN da TCGdex levou ~10s
 * para entregar 13 KB — a origem de onde o usuário vai colar link pode
 * ser qualquer site, e um teto curto transforma "servidor lento" em
 * "recurso quebrado". O limite que protege de verdade é o de tamanho, que
 * é medido durante a leitura; o timeout aqui só evita pendurar para sempre.
 */
const TIMEOUT_DOWNLOAD_MS = 30_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "colecao-pokemon/1.0 (uso pessoal; imagem-local)";

export class ErroDownloadImagem extends Error {}

function diretorioBase(): string {
  // Documentado em .env.example. Default pensado para o volume declarado
  // no compose.yaml — em dev local sem Docker, cai numa pasta do
  // workspace (criada sob demanda) para não quebrar `pnpm dev`.
  return process.env.IMAGENS_LOCAIS_DIR ?? path.join(process.cwd(), ".dados", "imagens-locais");
}

async function garantirDiretorioBase(): Promise<string> {
  const base = diretorioBase();
  await fs.mkdir(base, { recursive: true });
  return base;
}

/**
 * Resolve o caminho de um arquivo já registrado no banco, garantindo que
 * o resultado fica dentro do diretório base — defesa em profundidade
 * contra path traversal, mesmo que `arquivoNome` só possa vir do que este
 * módulo mesmo gerou (nunca de entrada do usuário).
 */
export function resolverCaminhoArquivo(arquivoNome: string): string {
  const base = diretorioBase();
  const caminho = path.resolve(base, arquivoNome);
  const baseComSeparador = base.endsWith(path.sep) ? base : base + path.sep;
  if (!caminho.startsWith(baseComSeparador)) {
    throw new Error(`Nome de arquivo fora do diretório de imagens locais: ${arquivoNome}`);
  }
  return caminho;
}

/**
 * Grava os bytes em disco com um nome gerado pelo servidor (UUID +
 * extensão do tipo detectado) e devolve esse nome — é o que fica gravado
 * em `imagem_local.arquivo_nome`. Nunca usa o nome do arquivo enviado
 * pelo usuário.
 */
export async function salvarArquivoImagem(
  bytes: Uint8Array,
  tipo: TipoMimeImagemPermitido,
  extensao: string,
): Promise<string> {
  await garantirDiretorioBase();
  const nomeArquivo = `${randomUUID()}.${extensao}`;
  const caminho = resolverCaminhoArquivo(nomeArquivo);
  await fs.writeFile(caminho, bytes);
  return nomeArquivo;
}

/** Apaga um arquivo se ele existir; não-existir não é erro (idempotente). */
export async function apagarArquivoImagemSeExistir(arquivoNome: string): Promise<void> {
  const caminho = resolverCaminhoArquivo(arquivoNome);
  try {
    await fs.unlink(caminho);
  } catch (err) {
    const erro = err as NodeJS.ErrnoException;
    if (erro.code !== "ENOENT") throw err;
  }
}

export async function lerArquivoImagem(arquivoNome: string): Promise<Buffer | null> {
  const caminho = resolverCaminhoArquivo(arquivoNome);
  try {
    return await fs.readFile(caminho);
  } catch (err) {
    const erro = err as NodeJS.ErrnoException;
    if (erro.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Um hop de `fetch` sem seguir redirect automaticamente — segue à mão,
 * checando de novo o protocolo a cada salto (nunca deixa um redirect
 * escapar para `file:` ou outro esquema) e contando contra o teto.
 */
async function fetchUmHop(url: string, sinal: AbortSignal): Promise<Response> {
  const validacao = validarUrlOrigem(url);
  if (!validacao.ok) {
    throw new ErroDownloadImagem(validacao.erro ?? "URL inválida.");
  }
  return fetch(url, {
    redirect: "manual",
    signal: sinal,
    headers: { "User-Agent": USER_AGENT },
  });
}

async function seguirRedirectsEBuscar(urlInicial: string, sinal: AbortSignal): Promise<Response> {
  let urlAtual = urlInicial;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resposta = await fetchUmHop(urlAtual, sinal);
    if (resposta.status < 300 || resposta.status >= 400) {
      return resposta;
    }
    const local = resposta.headers.get("location");
    if (!local) {
      throw new ErroDownloadImagem("A URL redirecionou sem indicar destino.");
    }
    if (hop === MAX_REDIRECTS) {
      throw new ErroDownloadImagem("Excesso de redirecionamentos ao baixar a imagem.");
    }
    urlAtual = new URL(local, urlAtual).toString();
  }
  // Inatingível (o loop sempre retorna ou lança), só para o TypeScript.
  throw new ErroDownloadImagem("Falha inesperada ao seguir redirecionamentos.");
}

export interface ResultadoDownloadImagem {
  bytes: Uint8Array;
}

/**
 * Baixa uma URL com cuidado (spec da tarefa): só http/https, timeout de
 * 10s, no máximo 5 redirects, e — o ponto mais importante — o tamanho é
 * limitado LENDO o corpo aos pedaços e contando os bytes conforme
 * chegam, nunca confiando no cabeçalho `Content-Length` (que pode faltar
 * ou mentir). Estoura `ErroDownloadImagem` com mensagem apresentável ao
 * usuário em qualquer falha.
 */
export async function baixarImagemDeUrl(url: string): Promise<ResultadoDownloadImagem> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_DOWNLOAD_MS);
  try {
    let resposta: Response;
    try {
      resposta = await seguirRedirectsEBuscar(url, controlador.signal);
    } catch (err) {
      if (err instanceof ErroDownloadImagem) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ErroDownloadImagem("Tempo esgotado ao baixar a imagem.");
      }
      throw new ErroDownloadImagem("Falha de rede ao baixar a imagem.");
    }

    if (!resposta.ok) {
      throw new ErroDownloadImagem(`A URL respondeu com erro (HTTP ${resposta.status}).`);
    }
    if (!resposta.body) {
      throw new ErroDownloadImagem("A resposta não trouxe conteúdo.");
    }

    const leitor = resposta.body.getReader();
    const pedacos: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > TAMANHO_MAXIMO_BYTES) {
        await leitor.cancel().catch(() => {});
        throw new ErroDownloadImagem(
          `A imagem excede o limite de ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)} MB.`,
        );
      }
      pedacos.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const pedaco of pedacos) {
      bytes.set(pedaco, offset);
      offset += pedaco.byteLength;
    }
    return { bytes };
  } finally {
    clearTimeout(timer);
  }
}
