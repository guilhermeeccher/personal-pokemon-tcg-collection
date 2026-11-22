import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import {
  criarColecaoComVagas,
  listarColecoes,
  resolverCriacaoColecao,
} from "@/lib/db/consultas";
import { listarGruposColecao } from "@/lib/db/grupos-colecao";
import { validarCriacaoColecao } from "@/lib/dominio/colecao";
import { lerGrupoId } from "@/lib/dominio/grupos-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";

/**
 * GET /api/colecoes — lista as coleções com progresso (vagas totais e
 * preenchidas, spec §3.3: "87/151", "142/165"), já na ordem de exibição
 * (`listarColecoes`), e os grupos em ordem (`ListaColecoesDTO`).
 */
export const GET = comAcesso(async function GET() {
  const [colecoes, grupos] = await Promise.all([listarColecoes(db), listarGruposColecao(db)]);
  return NextResponse.json({ itens: colecoes, grupos });
});

/**
 * POST /api/colecoes — cria uma coleção e materializa as vagas na mesma
 * transação (critério de aceite da Fase 2): ou nasce com todas as vagas,
 * ou nada é gravado. A resolução das vagas é `resolverCriacaoColecao`, o
 * mesmo caminho da criação em lote de um grupo. `grupoId` opcional: a
 * coleção entra no fim do grupo (ou de "sem grupo").
 */
export const POST = comAcesso(async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarCriacaoColecao(corpo as Record<string, unknown>);
  const grupo = lerGrupoId((corpo as Record<string, unknown> | null)?.grupoId, true);
  if (!resultado.ok || !grupo.ok) {
    return NextResponse.json(
      {
        ...corpoRecusa("colecaoInvalida"),
        detalhes: [
          ...(resultado.ok ? [] : resultado.erros),
          ...(!grupo.ok && "erro" in grupo ? [grupo.erro] : []),
        ],
      },
      { status: 400 },
    );
  }

  const { colecao } = resultado;
  const resolucao = await resolverCriacaoColecao(db, colecao);
  if (!resolucao.ok) {
    return NextResponse.json(corpoDaRecusa(resolucao.motivo), { status: 400 });
  }
  const { chaves, avisoCatalogoIncompleto, avisoSemNumeracaoOficial } = resolucao;

  try {
    const criada = await criarColecaoComVagas(db, { ...colecao, chaves }, grupo.valor);
    if (!criada.ok) {
      return NextResponse.json(corpoRecusa("grupoColecaoNaoEncontrado"), { status: 404 });
    }
    return NextResponse.json(
      {
        id: criada.id,
        ...(avisoCatalogoIncompleto ? { avisoCatalogoIncompleto } : {}),
        ...(avisoSemNumeracaoOficial ? { avisoSemNumeracaoOficial } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/colecoes] falha ao criar:", err);
    return NextResponse.json(corpoRecusa("falhaAoGravarColecao"), { status: 400 });
  }
});
