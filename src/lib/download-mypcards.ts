/**
 * Download das fotos do mypcards para o nosso volume. Server-only (usa
 * `fetch` e disco) — nunca importado por componente `"use client"`.
 *
 * Vive aqui, e não dentro do script, porque duas entradas precisam do
 * mesmo caminho: o comando em lote (`scripts/baixar-imagens-mypcards.ts`)
 * e a tela, que dispara o download do set logo depois de o usuário
 * colar o link que o mapeia. Duas implementações divergiriam justamente
 * no que importa — o teto de taxa e a validação do arquivo.
 *
 * O porquê de baixar em vez de fazer hotlink, e o porquê do cliente ser
 * educado, estão no cabeçalho do script.
 */

import {
  apagarArquivoImagemSeExistir,
  salvarArquivoImagem,
} from "@/lib/armazenamento-imagens";
import type { Database } from "@/lib/db/client";
import { upsertImagemLocal } from "@/lib/db/imagens-locais";
import {
  listarCartasSemFotoDeSetMapeado,
  type CartaSemFoto,
} from "@/lib/db/mypcards";
import { extensaoParaMime, validarArquivoImagem } from "@/lib/dominio/imagem-local";
import { idiomaSuportado, urlImagemMypcards } from "@/lib/dominio/mypcards";
import { criarLimitador } from "@/lib/sync/limitador";

/**
 * Mesmo teto do sync da TCGdex. Foi disparar sem teto que rendeu o
 * bloqueio de IP de 2026-08-25 — a lição não é sobre a TCGdex, é sobre
 * como se bate na porta de terceiro.
 */
const REQUISICOES_POR_SEGUNDO = 4;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "colecao-pokemon/1.0 (colecao pessoal; imagem de carta)";

export type ResultadoDownload = "baixada" | "ausente" | "falhou" | "pulada";

export interface ResumoDownload {
  baixadas: number;
  ausentes: number;
  falhas: number;
  puladas: number;
}

export async function baixarImagemDaCarta(
  db: Database,
  carta: CartaSemFoto,
  numeroSet: number,
): Promise<ResultadoDownload> {
  // O site é brasileiro e não publica japonês; montar a URL mesmo assim
  // seria uma requisição perdida por carta.
  if (!idiomaSuportado(carta.idioma)) return "pulada";

  const url = urlImagemMypcards({
    numeroSet,
    setId: carta.setId,
    localId: carta.localId,
    idioma: carta.idioma,
  });

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/webp,image/jpeg,image/png" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return "falhou";
  }

  // 404 é resposta legítima e esperada: nem toda carta do set tem scan lá.
  if (resposta.status === 404) return "ausente";
  if (!resposta.ok) return "falhou";

  const bytes = new Uint8Array(await resposta.arrayBuffer());

  // Tipo pela ASSINATURA do arquivo, nunca pelo Content-Type declarado —
  // mesma regra do upload manual. Uma página de erro devolvida com 200
  // morre aqui em vez de virar "imagem" no volume.
  const validacao = validarArquivoImagem(bytes);
  if (!validacao.ok || !validacao.tipo) return "falhou";

  const arquivoNome = await salvarArquivoImagem(
    bytes,
    validacao.tipo,
    extensaoParaMime(validacao.tipo),
  );
  const { arquivoNomeAnterior } = await upsertImagemLocal(db, {
    cartaId: carta.cartaId,
    idioma: carta.idioma,
    arquivoNome,
    mimeType: validacao.tipo,
    tamanhoBytes: bytes.byteLength,
    origem: "mypcards",
    origemUrl: url,
  });
  if (arquivoNomeAnterior) await apagarArquivoImagemSeExistir(arquivoNomeAnterior);
  return "baixada";
}

/**
 * Baixa o que falta de um conjunto de sets já mapeados.
 *
 * A lista de candidatas é recalculada a cada chamada a partir da ausência
 * de foto, então isto é idempotente por construção: repetir não rebaixa
 * nada, e uma carta que ganhou foto oficial no meio do caminho some da
 * lista sozinha.
 */
export async function baixarImagensDeSets(
  db: Database,
  numeroPorSet: Map<string, number>,
  setId?: string,
  aoProgredir?: (carta: CartaSemFoto, resultado: ResultadoDownload) => void,
): Promise<ResumoDownload> {
  const cartas = await listarCartasSemFotoDeSetMapeado(db, setId);
  const limitador = criarLimitador({ porSegundo: REQUISICOES_POR_SEGUNDO });
  const resumo: ResumoDownload = { baixadas: 0, ausentes: 0, falhas: 0, puladas: 0 };

  for (const carta of cartas) {
    const numero = numeroPorSet.get(carta.setId);
    if (numero === undefined) continue;
    await limitador.aguardarVez();
    const resultado = await baixarImagemDaCarta(db, carta, numero);
    if (resultado === "baixada") resumo.baixadas += 1;
    else if (resultado === "ausente") resumo.ausentes += 1;
    else if (resultado === "falhou") resumo.falhas += 1;
    else resumo.puladas += 1;
    aoProgredir?.(carta, resultado);
  }

  return resumo;
}
