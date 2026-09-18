import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { listarVagasPreenchidasParaExportacao, obterColecaoPorId } from "@/lib/db/consultas";
import {
  adapterNossoCsvColecao,
  gerarCsv,
  nomeArquivoColecao,
} from "@/lib/dominio/exportacao-csv";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/colecoes/:id/exportar — CSV das vagas PREENCHIDAS de uma
 * coleção (spec §5/§6 Fase 3), com a coluna extra `Vaga` (a chave que a
 * cópia ocupa). Vaga vazia fica de fora de propósito — "o que falta" já
 * tem tela própria; misturar quebraria a conferência de linhas.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const itens = await listarVagasPreenchidasParaExportacao(db, id);
  const csv = gerarCsv(adapterNossoCsvColecao, itens);
  const nomeArquivo = nomeArquivoColecao(colecao.nome, new Date().toISOString().slice(0, 10));

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
