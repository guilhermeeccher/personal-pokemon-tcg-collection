import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { alterarEscopoDaColecaoPokedex } from "@/lib/db/consultas";
import { validarParametroPokedex } from "@/lib/dominio/parametro-colecao";
import { corpoDaRecusa, corpoRecusa } from "@/lib/dominio/recusa";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * PATCH /api/colecoes/:id/escopo — adiciona e/ou remove região do escopo
 * de uma coleção `pokedex` existente (item 1 do incremento sobre a Fase
 * 2). Mesmo padrão de `PATCH /api/colecoes/:id/secretas`: única outra
 * exceção estrutural ao parâmetro — `PATCH /api/colecoes/:id` continua
 * recusando `parametro`/`tipo`.
 *
 * Corpo: o mesmo formato de `parametro` de uma coleção pokedex —
 * `{ escopo: "nacional" }` ou `{ escopo: "regioes", regioes: [...] }` —
 * representando o ESCOPO ALVO completo (não um delta). O diff contra o
 * escopo atual é calculado no servidor (`escopo-colecao.ts`):
 * - Região nova no alvo → vaga nasce, nunca toca vaga existente.
 * - Região removida do alvo → vaga é apagada, mas só se nenhuma vaga
 *   daquela faixa estiver preenchida; a recusa conta quantas e em qual
 *   região, nunca "operação inválida" genérico.
 *
 * Exemplos: Kanto → Kanto+Johto envia
 * `{ escopo: "regioes", regioes: ["kanto", "johto"] }`; Kanto+Johto →
 * Kanto envia `{ escopo: "regioes", regioes: ["kanto"] }`; para nacional
 * envia `{ escopo: "nacional" }`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Id fora do formato UUID nunca existe — 404 direto, sem deixar o
  // Postgres rejeitar a sintaxe e virar 500 (mesmo padrão das outras
  // rotas de coleção, achado do coordenador, 2026-08-25).
  if (!ehUuid(id)) {
    return NextResponse.json(corpoRecusa("colecaoNaoEncontrada"), { status: 404 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultadoValidacao = validarParametroPokedex(corpo);
  if (!resultadoValidacao.ok) {
    return NextResponse.json(
      { ...corpoRecusa("escopoInvalido"), detalhes: resultadoValidacao.erros },
      { status: 400 },
    );
  }

  const resultado = await alterarEscopoDaColecaoPokedex(db, id, resultadoValidacao.parametro);
  if (!resultado.ok) {
    const status = resultado.motivo.chave === "colecaoNaoEncontrada" ? 404 : 400;
    return NextResponse.json(corpoDaRecusa(resultado.motivo), { status });
  }
  return NextResponse.json({ ok: true, adicionadas: resultado.adicionadas, removidas: resultado.removidas });
}
