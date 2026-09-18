import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  criarColecaoComVagas,
  listarColecoes,
  obterInfoSetParaVagas,
} from "@/lib/db/consultas";
import { validarCriacaoColecao } from "@/lib/dominio/colecao";
import type { ParametroPokedex, ParametroSet } from "@/lib/dominio/parametro-colecao";
import { resolverChavesVagas } from "@/lib/dominio/vagas-colecao";
import { detectarCatalogoIncompleto } from "@/lib/dominio/catalogo-incompleto";
import { resolverUniversoVagasSet } from "@/lib/dominio/numeracao-oficial-set";

/**
 * GET /api/colecoes — lista as coleções com progresso (vagas totais e
 * preenchidas, spec §3.3: "87/151", "142/165").
 */
export async function GET() {
  const colecoes = await listarColecoes(db);
  return NextResponse.json({ itens: colecoes });
}

/**
 * POST /api/colecoes — cria uma coleção e materializa as vagas na mesma
 * transação (critério de aceite da Fase 2): ou nasce com todas as vagas,
 * ou nada é gravado.
 *
 * Para `tipo: "set"`, resolve as chaves de vaga a partir das cartas reais
 * do set no catálogo (nunca de um range gerado) — `local_id` ordenado de
 * forma natural, cortado em `set_qtd_oficial`/`set_qtd_total` conforme
 * `incluirSecretas` (regra 4).
 */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarCriacaoColecao(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Coleção inválida.", detalhes: resultado.erros }, { status: 400 });
  }

  const { colecao } = resultado;

  let chaves: string[];
  // Presente só para tipo "set" — o catálogo local pode não conhecer o
  // set inteiro (achado do coordenador: `mfb` tem 34 de 48 cartas
  // oficiais). Nunca bloqueia a criação; só avisa, pra a coleção não
  // fingir estar completa quando não está (regra 6 do AGENTS.md).
  let avisoCatalogoIncompleto: ReturnType<typeof detectarCatalogoIncompleto> = null;
  // Presente só quando o set não tem numeração oficial no upstream (ex.:
  // `mep`, `set_qtd_oficial = 0`) — `numeracao-oficial-set.ts` decide usar
  // `qtdTotal` como universo nesse caso, pra não cortar em 0 vagas.
  let avisoSemNumeracaoOficial: ReturnType<
    typeof resolverUniversoVagasSet
  >["avisoSemNumeracaoOficial"] = null;
  if (colecao.tipo === "pokedex") {
    const parametroPokedex = colecao.parametro as ParametroPokedex;
    chaves = resolverChavesVagas({ tipo: "pokedex", parametro: parametroPokedex });
  } else if (colecao.tipo === "set") {
    const parametroSet = colecao.parametro as ParametroSet;
    const info = await obterInfoSetParaVagas(db, parametroSet.setId, parametroSet.idiomaCatalogo);
    if (!info) {
      return NextResponse.json(
        { erro: `Set '${parametroSet.setId}' não encontrado no catálogo em '${parametroSet.idiomaCatalogo}'.` },
        { status: 400 },
      );
    }
    const universo = resolverUniversoVagasSet({
      qtdOficial: info.qtdOficial,
      qtdTotal: info.qtdTotal,
      incluirSecretas: parametroSet.incluirSecretas,
      qtdCartasNoCatalogo: info.localIds.length,
    });
    // Defensivo: `info !== null` já implica ao menos uma carta no
    // catálogo (linha acima), então isto só dispara se `qtdTotal` também
    // vier 0 — nenhuma carta utilizável pra materializar vaga nenhuma.
    // Nunca cria coleção vazia em silêncio (regra 6 do AGENTS.md).
    if (universo.vagasEsperadas === 0) {
      return NextResponse.json(
        {
          erro: `Set '${parametroSet.setId}' não tem nenhuma carta utilizável no catálogo em '${parametroSet.idiomaCatalogo}'.`,
        },
        { status: 400 },
      );
    }
    chaves = resolverChavesVagas({
      tipo: "set",
      localIdsDoSet: info.localIds,
      qtdOficial: info.qtdOficial,
      qtdTotal: info.qtdTotal,
      incluirSecretas: parametroSet.incluirSecretas,
    });
    avisoCatalogoIncompleto = detectarCatalogoIncompleto(chaves.length, universo.vagasEsperadas);
    avisoSemNumeracaoOficial = universo.avisoSemNumeracaoOficial;
  } else {
    chaves = resolverChavesVagas({ tipo: "customizada" });
  }

  try {
    const { id } = await criarColecaoComVagas(db, { ...colecao, chaves });
    return NextResponse.json(
      {
        id,
        ...(avisoCatalogoIncompleto ? { avisoCatalogoIncompleto } : {}),
        ...(avisoSemNumeracaoOficial ? { avisoSemNumeracaoOficial } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/colecoes] falha ao criar:", err);
    return NextResponse.json({ erro: "Falha ao gravar a coleção." }, { status: 400 });
  }
}
