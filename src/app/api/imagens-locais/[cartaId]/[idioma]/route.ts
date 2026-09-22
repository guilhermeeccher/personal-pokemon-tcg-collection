import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { obterVariantesDisponiveisDaCarta } from "@/lib/db/consultas";
import {
  obterImagemLocal,
  removerImagemLocal,
  upsertImagemLocal,
} from "@/lib/db/imagens-locais";
import { ehIdioma } from "@/lib/dominio/enums";
import { corpoDaRecusa, corpoRecusa, recusa } from "@/lib/dominio/recusa";
import {
  extensaoParaMime,
  validarArquivoImagem,
  validarUrlOrigem,
} from "@/lib/dominio/imagem-local";
import {
  ErroDownloadImagem,
  apagarArquivoImagemSeExistir,
  baixarImagemDeUrl,
  lerArquivoImagem,
  salvarArquivoImagem,
} from "@/lib/armazenamento-imagens";

/**
 * `imagem_local`: a foto que o usuário fornece para uma carta do
 * CATÁLOGO sem imagem em nenhuma fonte automática (spec da tarefa
 * "carta sem foto", 2026-08-26). Recurso único, identificado pela MESMA
 * chave primária de `carta_catalogo` — `(cartaId, idioma)` — nos três
 * verbos abaixo:
 *
 * - `POST`   — envia/substitui a imagem, por arquivo OU por URL colada
 *              (o servidor baixa e guarda o arquivo — nunca só a URL).
 *              Uma rota só para as duas formas: ambas produzem o mesmo
 *              resultado (bytes validados e gravados em disco) e
 *              compartilham toda a validação; separar em duas rotas só
 *              duplicaria a checagem de existência da carta e o upsert.
 * - `GET`    — serve os bytes do arquivo, com o `Content-Type` correto.
 *              É a URL que `imagemComFallbackCdn` (lib/db/consultas.ts)
 *              monta quando existe imagem local.
 * - `DELETE` — remove o registro e o arquivo (a carta volta ao estado
 *              sem foto).
 *
 * `idioma` aqui é o idioma do CATÁLOGO (o mesmo de `carta_catalogo.idioma`
 * / `copia.idiomaCatalogo`) — não o idioma físico da cópia. Decisão
 * explícita da tarefa: a imagem pertence à carta do catálogo, uma cópia
 * qualquer daquela carta (em qualquer idioma físico) mostra a mesma foto.
 */

interface Params {
  cartaId: string;
  idioma: string;
}

function validarParams(params: Params): { ok: true; idioma: "pt" | "en" | "jp" } | { ok: false } {
  if (!params.cartaId || !ehIdioma(params.idioma)) return { ok: false };
  return { ok: true, idioma: params.idioma };
}

/** POST — upload de arquivo (`arquivo` no FormData) ou download de URL (`url`). */
export async function POST(req: Request, { params }: { params: Promise<Params> }) {
  const resolvidos = await params;
  const validacao = validarParams(resolvidos);
  if (!validacao.ok) {
    return NextResponse.json({ erro: "cartaId/idioma inválidos." }, { status: 400 });
  }
  const { cartaId } = resolvidos;
  const { idioma } = validacao;

  // A imagem pertence a uma linha real do catálogo — evita gravar
  // metadado apontando para uma carta inexistente (a FK do banco também
  // barraria, mas aqui dá pra devolver uma mensagem clara em vez de erro
  // genérico de constraint).
  const existeNoCatalogo = await obterVariantesDisponiveisDaCarta(db, cartaId, idioma);
  if (existeNoCatalogo === null) {
    return NextResponse.json(
      corpoRecusa("cartaNaoEncontradaNoCatalogo", { cartaId, idioma }),
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { erro: "Corpo inválido — esperado multipart/form-data com 'arquivo' ou 'url'." },
      { status: 400 },
    );
  }

  const arquivo = formData.get("arquivo");
  const url = formData.get("url");
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  const temUrl = typeof url === "string" && url.trim() !== "";

  if (temArquivo === temUrl) {
    return NextResponse.json(
      { erro: "Envie exatamente um dos dois: um arquivo ('arquivo') ou uma URL ('url')." },
      { status: 400 },
    );
  }

  let bytes: Uint8Array;
  let origem: "upload" | "url";
  let origemUrl: string | null = null;

  if (temArquivo) {
    origem = "upload";
    bytes = new Uint8Array(await (arquivo as File).arrayBuffer());
  } else {
    const urlBruta = (url as string).trim();
    const validacaoUrl = validarUrlOrigem(urlBruta);
    if (!validacaoUrl.ok) {
      // `erro` é opcional no tipo só porque `ok` e `erro` são campos
      // independentes ali; recusa sem recusa não existe (ver
      // `validarUrlOrigem`), daí o `!`.
      return NextResponse.json(corpoDaRecusa(validacaoUrl.erro!), { status: 400 });
    }
    origem = "url";
    origemUrl = urlBruta;
    try {
      const resultado = await baixarImagemDeUrl(urlBruta);
      bytes = resultado.bytes;
    } catch (err) {
      const recusaDoDownload =
        err instanceof ErroDownloadImagem ? err.recusa : recusa("falhaAoBaixarImagemDaUrl");
      return NextResponse.json(corpoDaRecusa(recusaDoDownload), { status: 400 });
    }
  }

  const validacaoArquivo = validarArquivoImagem(bytes);
  if (!validacaoArquivo.ok || !validacaoArquivo.tipo) {
    // Mesmo caso do `!` acima: recusa de arquivo sempre traz a recusa.
    return NextResponse.json(corpoDaRecusa(validacaoArquivo.erro!), { status: 400 });
  }
  const tipo = validacaoArquivo.tipo;

  // Grava o arquivo novo ANTES de tocar o banco: se o upsert falhar, o
  // arquivo novo fica órfão (limpável), mas nunca temos um registro
  // apontando para um arquivo que não existe — a garantia que a tarefa
  // pede é nessa direção.
  const arquivoNome = await salvarArquivoImagem(bytes, tipo, extensaoParaMime(tipo));

  let arquivoNomeAnterior: string | null;
  try {
    const resultado = await upsertImagemLocal(db, {
      cartaId,
      idioma,
      arquivoNome,
      mimeType: tipo,
      tamanhoBytes: bytes.byteLength,
      origem,
      origemUrl,
    });
    arquivoNomeAnterior = resultado.arquivoNomeAnterior;
  } catch (err) {
    await apagarArquivoImagemSeExistir(arquivoNome);
    console.error("[POST /api/imagens-locais] falha ao gravar registro:", err);
    return NextResponse.json(corpoRecusa("falhaAoGravarImagem"), { status: 500 });
  }

  // Substituição: apaga o arquivo antigo só depois que o novo já está
  // gravado no banco com sucesso — nunca deixa o arquivo velho perdido
  // no disco, e nunca apaga o velho antes de garantir o novo.
  if (arquivoNomeAnterior && arquivoNomeAnterior !== arquivoNome) {
    await apagarArquivoImagemSeExistir(arquivoNomeAnterior);
  }

  return NextResponse.json(
    {
      ok: true,
      cartaId,
      idioma,
      mimeType: tipo,
      tamanhoBytes: bytes.byteLength,
      origem,
      url: `/api/imagens-locais/${encodeURIComponent(cartaId)}/${idioma}`,
    },
    { status: 201 },
  );
}

/** GET — serve os bytes do arquivo. Resolve sempre pelo registro do banco, nunca por caminho vindo da URL. */
export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const resolvidos = await params;
  const validacao = validarParams(resolvidos);
  if (!validacao.ok) {
    return NextResponse.json({ erro: "cartaId/idioma inválidos." }, { status: 400 });
  }
  const { cartaId } = resolvidos;
  const { idioma } = validacao;

  const registro = await obterImagemLocal(db, cartaId, idioma);
  if (!registro) {
    return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });
  }

  const bytes = await lerArquivoImagem(registro.arquivoNome);
  if (!bytes) {
    // Registro sem arquivo no disco (inconsistência externa ao fluxo
    // desta API, ex.: volume apagado manualmente) — não finge que existe.
    return NextResponse.json({ erro: "Arquivo da imagem não encontrado no disco." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": registro.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** DELETE — remove o registro e o arquivo. A carta volta ao estado sem foto. */
export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const resolvidos = await params;
  const validacao = validarParams(resolvidos);
  if (!validacao.ok) {
    return NextResponse.json({ erro: "cartaId/idioma inválidos." }, { status: 400 });
  }
  const { cartaId } = resolvidos;
  const { idioma } = validacao;

  const removido = await removerImagemLocal(db, cartaId, idioma);
  if (!removido) {
    return NextResponse.json(corpoRecusa("imagemNaoEncontrada"), { status: 404 });
  }
  await apagarArquivoImagemSeExistir(removido.arquivoNome);

  return NextResponse.json({ ok: true });
}
