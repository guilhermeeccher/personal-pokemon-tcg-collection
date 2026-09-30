import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  criarColecaoComVagas,
  listarColecoes,
  lerReceitaNoCatalogo,
} from "@/lib/db/consultas";
import { validarCriacaoColecao } from "@/lib/dominio/colecao";
import { corpoRecusa } from "@/lib/dominio/recusa";
import type { ParametroPokedex, ParametroSet } from "@/lib/dominio/parametro-colecao";
import {
  avisosDaReceita,
  resolverChavesVagas,
  type AvisosDaReceita,
} from "@/lib/dominio/vagas-colecao";

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
 * de cada set da receita no catálogo (nunca de um range gerado) —
 * `local_id` ordenado de forma natural, cortado em
 * `set_qtd_oficial`/`set_qtd_total` conforme `incluirSecretas` (regra 4),
 * qualificado pelo set (`chave-vaga-set.ts`).
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
    return NextResponse.json(
      { ...corpoRecusa("colecaoInvalida"), detalhes: resultado.erros },
      { status: 400 },
    );
  }

  const { colecao } = resultado;

  let chaves: string[];
  // Presente só para tipo "set" — o catálogo local pode não conhecer o
  // set inteiro (achado do coordenador: `mfb` tem 34 de 48 cartas
  // oficiais). Nunca bloqueia a criação; só avisa, pra a coleção não
  // fingir estar completa quando não está (regra 6 do AGENTS.md).
  let avisoCatalogoIncompleto: AvisosDaReceita["avisoCatalogoIncompleto"] = null;
  // Presente só quando o set não tem numeração oficial no upstream (ex.:
  // `mep`, `set_qtd_oficial = 0`) — `numeracao-oficial-set.ts` decide usar
  // `qtdTotal` como universo nesse caso, pra não cortar em 0 vagas.
  let avisoSemNumeracaoOficial: AvisosDaReceita["avisoSemNumeracaoOficial"] = null;
  if (colecao.tipo === "pokedex") {
    const parametroPokedex = colecao.parametro as ParametroPokedex;
    chaves = resolverChavesVagas({ tipo: "pokedex", parametro: parametroPokedex });
  } else if (colecao.tipo === "set") {
    const parametroSet = colecao.parametro as ParametroSet;
    // Cada set da receita, carta a carta (`lerReceitaNoCatalogo`). Um set
    // que o catálogo não tem recusa a criação inteira: juntar sets e
    // descobrir depois que um deles veio vazio seria a coleção mentindo.
    const { sets, faltando } = await lerReceitaNoCatalogo(db, parametroSet);
    if (faltando.length > 0) {
      return NextResponse.json(
        corpoRecusa("setNaoEncontradoNoCatalogoEmIdioma", {
          setId: faltando.join(", "),
          idioma: parametroSet.idiomaCatalogo,
        }),
        { status: 400 },
      );
    }
    chaves = resolverChavesVagas({
      tipo: "set",
      sets,
      incluirSecretas: parametroSet.incluirSecretas,
    });
    // Nunca cria coleção vazia em silêncio (regra 6 do AGENTS.md): só
    // dispara se nenhum set da receita tem carta utilizável.
    if (chaves.length === 0) {
      return NextResponse.json(
        corpoRecusa("setSemCartaUtilizavel", {
          setId: parametroSet.sets.join(", "),
          idioma: parametroSet.idiomaCatalogo,
        }),
        { status: 400 },
      );
    }
    ({ avisoCatalogoIncompleto, avisoSemNumeracaoOficial } = avisosDaReceita(
      sets,
      parametroSet.incluirSecretas,
    ));
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
    return NextResponse.json(corpoRecusa("falhaAoGravarColecao"), { status: 400 });
  }
}
