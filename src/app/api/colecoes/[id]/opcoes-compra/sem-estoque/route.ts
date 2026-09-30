import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import { desmarcarEscolhas, listarEscolhas } from "@/lib/db/escolhas";
import {
  listarSemEstoqueVigente,
  registrarSemEstoque,
  removerSemEstoque,
} from "@/lib/db/sem-estoque";
import {
  chaveSemEstoque,
  lerRetornoSemEstoque,
  VALIDADE_SEM_ESTOQUE_DIAS,
} from "@/lib/dominio/sem-estoque-liga";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * /api/colecoes/:id/opcoes-compra/sem-estoque — o retorno "Cards sem estoque"
 * da Compra por Lista, colado de volta na tela (decisão de 2026-09-24). O
 * porquê está em `lib/dominio/sem-estoque-liga.ts`.
 *
 * - `GET` — os registros vigentes. Globais: estoque é da loja, não da coleção.
 * - `POST { texto, confirmar }` — sem `confirmar`, só a **prévia**: o que foi
 *   entendido e quais escolhas desta coleção seriam desmarcadas. Com
 *   `confirmar: true`, grava e desmarca, na mesma transação.
 * - `DELETE ?item=<id>` — "voltar a oferecer" antes de o registro vencer.
 *
 * **Desmarcar só vale nesta coleção, e só em vaga vazia** — é a lista de onde
 * a colagem saiu. A escolha de vaga já preenchida está guardada fora da string
 * e não foi colada; tirá-la seria mexer no que o usuário não viu.
 */

async function colecaoOu404(id: string) {
  if (!ehUuid(id)) return null;
  return obterColecaoPorId(db, id);
}

const naoEncontrada = () =>
  NextResponse.json({ erro: "Coleção não encontrada." }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await colecaoOu404(id))) return naoEncontrada();

  const itens = await listarSemEstoqueVigente(db);
  const validadeMs = VALIDADE_SEM_ESTOQUE_DIAS * 24 * 60 * 60 * 1000;
  return NextResponse.json({
    validadeDias: VALIDADE_SEM_ESTOQUE_DIAS,
    itens: itens.map((i) => ({
      id: i.id,
      nome: i.nome,
      numero: i.numero,
      total: i.total,
      qualidade: i.qualidade,
      registradoEm: i.registradoEm.toISOString(),
      venceEm: new Date(i.registradoEm.getTime() + validadeMs).toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await colecaoOu404(id))) return naoEncontrada();

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }
  const bruto = corpo as { texto?: unknown; confirmar?: unknown };
  if (typeof bruto.texto !== "string") {
    return NextResponse.json({ erro: "Esperado { texto: string }." }, { status: 400 });
  }

  const { cartas, naoEntendidas } = lerRetornoSemEstoque(bruto.texto);
  if (cartas.length === 0) {
    return NextResponse.json(
      { erro: "Nenhuma carta reconhecida no texto colado.", naoEntendidas },
      { status: 400 },
    );
  }

  const chaves = new Set(cartas.map(chaveSemEstoque));
  const afetadas = (await listarEscolhas(db, id)).filter(
    (e) => e.vagaVazia && chaves.has(chaveSemEstoque(e)),
  );

  if (bruto.confirmar !== true) {
    return NextResponse.json({
      naoEntendidas,
      cartas: cartas.map((c) => {
        const chave = chaveSemEstoque(c);
        return {
          ...c,
          escolhas: afetadas
            .filter((e) => chaveSemEstoque(e) === chave)
            .map((e) => ({ chave: e.chave, especie: e.especie, edicaoSigla: e.edicaoSigla })),
        };
      }),
      desmarcariam: afetadas.length,
    });
  }

  // Juntas ou nenhuma: registrar sem desmarcar deixaria na string a carta que
  // a Liga acabou de dizer que não tem.
  const resultado = await db.transaction(async (tx) => ({
    registradas: await registrarSemEstoque(tx, cartas),
    desmarcadas: await desmarcarEscolhas(
      tx,
      id,
      afetadas.map((e) => ({ chave: e.chave, identidade: e.identidade })),
    ),
  }));

  return NextResponse.json({ ...resultado, naoEntendidas });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await colecaoOu404(id))) return naoEncontrada();

  const item = new URL(req.url).searchParams.get("item");
  if (item === null || !ehUuid(item)) {
    return NextResponse.json({ erro: "Esperado ?item=<id>." }, { status: 400 });
  }
  return NextResponse.json({ removidas: await removerSemEstoque(db, item) });
}
