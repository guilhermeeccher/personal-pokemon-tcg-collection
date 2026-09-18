import { db } from "@/lib/db/client";
import { listarCopiasParaExportacao } from "@/lib/db/consultas";
import {
  adapterNossoCsvInventario,
  gerarCsv,
  nomeArquivoInventario,
} from "@/lib/dominio/exportacao-csv";

/**
 * GET /api/copias/exportar — CSV do inventário completo (spec §5/§6 Fase
 * 3). Uma linha por cópia (não por unidade — `quantidade` é uma coluna),
 * `;` como separador e BOM UTF-8 para abrir com acentuação correta em
 * planilha pt-BR. Baixa direto, sem passo intermediário — é por isso que
 * a resposta não é JSON.
 */
export async function GET() {
  const itens = await listarCopiasParaExportacao(db);
  const csv = gerarCsv(adapterNossoCsvInventario, itens);
  const nomeArquivo = nomeArquivoInventario(new Date().toISOString().slice(0, 10));

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
