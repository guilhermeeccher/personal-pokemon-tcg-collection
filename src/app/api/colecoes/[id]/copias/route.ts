import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adicionarCopiaEmColecaoCustomizada } from "@/lib/db/consultas";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * POST /api/colecoes/:id/copias — adiciona uma cópia a uma coleção
 * CUSTOMIZADA: cria a vaga (chave sequencial) e aloca a cópia na mesma
 * transação, porque customizada não tem universo fixo nem vaga vazia
 * pré-existente (spec §3.3; decisão fechada em
 * 2026-08-25). Para pokedex/set, use `POST /api/vagas/:id/alocar` numa
 * vaga já existente — esta rota recusa com 400 se a coleção do :id não
 * for do tipo customizada.
 *
 * Body: `{ copiaId: string, permitirForaDePadrao?: boolean }`.
 * Erros de regra (coleção não customizada, cópia já alocada, idioma
 * fora de padrão sem o sinalizador) voltam 400 com a RECUSA em `recusa`
 * — chave estável e valores, que a tela traduz para o idioma da
 * interface (`lib/dominio/recusa.ts`). 404 só quando a própria coleção
 * da URL não existe —
 * inclusive quando `:id` nem tem formato de UUID (achado do
 * coordenador, 2026-08-25: nunca deixa o Postgres virar isso em 500).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const body = corpo as { copiaId?: unknown; permitirForaDePadrao?: unknown };
  const copiaId =
    typeof body.copiaId === "string" && body.copiaId.trim() !== "" ? body.copiaId : null;
  if (!copiaId) {
    return NextResponse.json({ erro: "copiaId ausente ou vazio." }, { status: 400 });
  }
  const permitirForaDePadrao = body.permitirForaDePadrao === true;

  const resultado = await adicionarCopiaEmColecaoCustomizada(db, id, copiaId, {
    permitirForaDePadrao,
  });
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "colecaoNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }

  return NextResponse.json(
    {
      ok: true,
      vagaId: resultado.vagaId,
      chave: resultado.chave,
      copiaAlocadaId: resultado.copiaAlocadaId,
      dividida: resultado.dividida,
      foraDePadrao: resultado.foraDePadrao,
    },
    { status: 201 },
  );
}
