import { NextResponse } from "next/server";

import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import { listarEscolhas } from "@/lib/db/escolhas";
import { gerarCsv, nomeArquivoColecao, slugificar } from "@/lib/dominio/exportacao-csv";
import {
  adapterListaCompra,
  dividirListaCompra,
  gerarListaLiga,
  gerarListaTexto,
  totalDaLista,
  type LinhaListaCompra,
} from "@/lib/dominio/exportacao-lista-compra";
import { ehUuid } from "@/lib/dominio/uuid";
import { linhaDaEscolha } from "@/lib/liga/lista-compra";

/**
 * GET /api/colecoes/:id/opcoes-compra/exportar?formato=csv|texto|liga[&aba=kanto-1]
 *
 * Exporta **só o que o usuário marcou** na última varredura. Exportar a
 * varredura inteira seria devolver centenas de linhas que ele não escolheu —
 * o oposto do pedido, que é sair da tela com a lista de compra decidida.
 *
 * - `csv` — documento de conferência nosso, com edição, raridade, extra e
 *   quantas lojas têm cada carta.
 * - `texto` — lista nossa, com a sigla da edição no fim.
 * - `liga` — o formato da Compra por Lista deles, aprendido em 2026-09-16.
 *   Com `aba`, só aquela aba (até 110 cartas, o limite deles; por região na
 *   Pokédex) — é o que a tela pede, e o `id` é o mesmo que ela mostra. Sem
 *   `aba`, a lista inteira, que acima de 110 cartas não cabe numa colagem.
 *   Ver `dividirListaCompra` em `exportacao-lista-compra.ts`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  // A mesma montagem que alimenta a tela — e, como ela, **não depende de
  // varredura**: a triagem do usuário vive em `escolha_compra` desde
  // 2026-09-17. Só entram as escolhas de vaga ainda vazia; o que ele já
  // cadastrou sai da lista sozinho.
  const linhas: LinhaListaCompra[] = (await listarEscolhas(db, id))
    .filter((e) => e.vagaVazia)
    .map(linhaDaEscolha);

  if (linhas.length === 0) {
    return NextResponse.json(
      { erro: "Nenhuma carta na lista de compras para exportar." },
      { status: 400 },
    );
  }

  const formato = new URL(req.url).searchParams.get("formato") ?? "csv";
  const dataIso = new Date().toISOString().slice(0, 10);

  if (formato === "liga") {
    const idAba = new URL(req.url).searchParams.get("aba");
    let daAba = linhas;
    if (idAba !== null) {
      const tipo = colecao.tipo === "pokedex" ? "pokedex" : "set";
      // A mesma ordem de sets da tela, para o `id` da aba bater com o dela.
      const ordemSets = tipo === "set" ? ((colecao.parametro as ParametroSet).sets ?? []) : [];
      const aba = dividirListaCompra(linhas, tipo, undefined, ordemSets).find(
        (a) => a.id === idAba,
      );
      if (!aba) {
        // A lista mudou entre abrir a tela e clicar (uma carta cadastrada
        // pode sumir com a última aba). Melhor recusar que baixar outra aba.
        return NextResponse.json(
          { erro: "Essa aba não existe mais na lista de compras. Recarregue a tela." },
          { status: 404 },
        );
      }
      daAba = aba.linhas;
    }
    const sufixo = idAba === null ? "" : `-${idAba}`;
    return new NextResponse(gerarListaLiga(daAba), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="compra-por-lista-${slugificar(colecao.nome)}${sufixo}-${dataIso}.txt"`,
        "X-Total-Brl": String(totalDaLista(daAba)),
      },
    });
  }

  if (formato === "texto") {
    return new NextResponse(gerarListaTexto(linhas), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="lista-compra-${slugificar(colecao.nome)}-${dataIso}.txt"`,
        "X-Total-Brl": String(totalDaLista(linhas)),
      },
    });
  }

  if (formato !== "csv") {
    return NextResponse.json(
      { erro: 'formato deve ser "csv", "texto" ou "liga".' },
      { status: 400 },
    );
  }

  return new NextResponse(gerarCsv(adapterListaCompra, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivoColecao(`lista-compra-${colecao.nome}`, dataIso)}"`,
      "X-Total-Brl": String(totalDaLista(linhas)),
    },
  });
}
