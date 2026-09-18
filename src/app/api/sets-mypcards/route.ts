import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { baixarImagensDeSets } from "@/lib/download-mypcards";
import {
  listarCartasSemFotoDeSetMapeado,
  listarMapeamentos,
  salvarMapeamentoSet,
} from "@/lib/db/mypcards";
import { validarLinkMapeamentoSet } from "@/lib/dominio/mypcards";

/**
 * GET /api/sets-mypcards — os sets já mapeados.
 */
export async function GET() {
  return NextResponse.json({ mapeamentos: await listarMapeamentos(db) });
}

/**
 * POST /api/sets-mypcards — mapeia um set a partir de um link de imagem
 * do mypcards colado pelo usuário, e já baixa as fotos que faltam
 * naquele set.
 *
 * Por que o link entra à mão: o id do set é interno deles, não sai do
 * nosso catálogo, e as páginas do site estão atrás do challenge do
 * Cloudflare (nenhum cliente que não seja navegador passa). Descobrir por
 * varredura custaria ~2.400 requisições por set — foi martelando assim
 * que este servidor levou bloqueio de IP da TCGdex em agosto. Um paste
 * resolve o set inteiro, e só para set que ele de fato quer.
 *
 * O download roda **em segundo plano**, não dentro da resposta: um set de
 * promos tem ~180 linhas e, no teto de 4 req/s, isso é ~45 s — tempo
 * demais para segurar a requisição. A tela avisa quantas entraram na fila
 * e as fotos aparecem no reload seguinte. Fire-and-forget é aceitável
 * aqui porque o servidor é um processo Node de longa duração na rede
 * local, não uma função efêmera; se o processo cair no meio, a próxima
 * chamada (ou o script) retoma de onde parou, já que a lista de
 * candidatas é recalculada a partir da ausência de foto.
 */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const { setId, url } = (corpo ?? {}) as { setId?: unknown; url?: unknown };
  if (typeof setId !== "string" || !setId.trim()) {
    return NextResponse.json({ erro: "setId é obrigatório." }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ erro: "url é obrigatória." }, { status: 400 });
  }

  const validacao = validarLinkMapeamentoSet(url, setId);
  if (!validacao.ok) {
    return NextResponse.json({ erro: validacao.erro }, { status: 400 });
  }

  const { numeroSet } = validacao.referencia;
  await salvarMapeamentoSet(db, { setId, numero: numeroSet, origemUrl: url.trim() });

  const pendentes = await listarCartasSemFotoDeSetMapeado(db, setId);
  const numeroPorSet = new Map([[setId, numeroSet]]);

  void baixarImagensDeSets(db, numeroPorSet, setId).catch((erro) => {
    console.error(`Falha ao baixar imagens do set ${setId} no mypcards:`, erro);
  });

  return NextResponse.json({
    setId,
    numero: numeroSet,
    cartasNaFila: pendentes.length,
  });
}
