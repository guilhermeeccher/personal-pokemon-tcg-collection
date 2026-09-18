import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import {
  desmarcarEscolhas,
  escolhasPorId,
  marcarEscolhas,
  type EscolhaNova,
} from "@/lib/db/escolhas";
import { obterUltimaVarredura, opcoesPorId } from "@/lib/db/liga";
import { identidadeDaCarta } from "@/lib/dominio/identidade-carta";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * PATCH /api/colecoes/:id/opcoes-compra/selecao — marca ou desmarca cartas da
 * lista de compras.
 *
 * É o gesto do usuário montando a triagem: o sistema ordenou e mostrou, ele
 * escolhe (regra 5).
 *
 * **Desde 2026-09-17 a marcação não vive mais na linha da varredura.** Ela vai
 * para `escolha_compra`, presa à vaga, e por isso sobrevive a uma varredura
 * nova — que passa a atualizar o preço da triagem em vez de apagá-la. O motivo
 * está no cabeçalho da tabela: ele marcou 126 cartas da Pokédex, uma por vaga
 * vazia, e a próxima atualização de preço apagaria as 126.
 *
 * Corpo: `{ ids: string[], selecionada: boolean }`. Ao **marcar**, os ids são
 * de `liga_opcao` — é de lá que vêm os dados que a escolha guarda. Ao
 * **desmarcar**, valem ids de `liga_opcao` ou de `escolha_compra`: a lista de
 * compras existe sem varredura nenhuma, e ele precisa poder tirar carta dela
 * sem rodar uma busca antes.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  const colecao = await obterColecaoPorId(db, id);
  if (!colecao) {
    return NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const bruto = corpo as { ids?: unknown; selecionada?: unknown };
  if (
    !Array.isArray(bruto.ids) ||
    bruto.ids.some((i) => typeof i !== "string" || !ehUuid(i)) ||
    typeof bruto.selecionada !== "boolean"
  ) {
    return NextResponse.json(
      { erro: "Esperado { ids: string[], selecionada: boolean }." },
      { status: 400 },
    );
  }
  const ids = bruto.ids as string[];

  if (!bruto.selecionada) {
    // Resolve primeiro como id de escolha (o caminho que funciona sem
    // varredura); o que sobrar, resolve pela varredura corrente.
    const alvos = [...(await escolhasPorId(db, id, ids))];

    if (alvos.length < ids.length) {
      const varredura = await obterUltimaVarredura(db, id);
      if (varredura) {
        for (const o of await opcoesPorId(db, varredura.id, ids)) {
          alvos.push({ chave: o.chave, identidade: identidadeDaCarta(o) });
        }
      }
    }

    return NextResponse.json({ alteradas: await desmarcarEscolhas(db, id, alvos) });
  }

  const varredura = await obterUltimaVarredura(db, id);
  if (!varredura) {
    return NextResponse.json(
      { erro: "Nenhuma varredura para esta coleção. Busque as opções antes de marcar." },
      { status: 400 },
    );
  }

  const opcoes = await opcoesPorId(db, varredura.id, ids);
  if (opcoes.length === 0) return NextResponse.json({ alteradas: 0 });

  const novas: EscolhaNova[] = opcoes.map((o) => ({
    chave: o.chave,
    especie: o.especie,
    nome: o.nome,
    edicaoSigla: o.edicaoSigla,
    edid: o.edid,
    edicaoNome: o.edicaoNome,
    numero: o.numero,
    total: o.total,
    caminho: o.caminho,
    cartaId: o.cartaId,
    idiomaCatalogo: o.idiomaCatalogo,
    preco: o.preco,
  }));

  return NextResponse.json({ alteradas: await marcarEscolhas(db, id, novas) });
}
