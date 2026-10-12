import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { criarRegistro, listarRegistros } from "@/lib/db/dex";
import { lerDadosRegistro } from "@/lib/dominio/dex-registro";
import { corpoDasRecusas } from "@/lib/dominio/recusa";

import { lerCorpoJson, respostaSeModuloDesligado } from "../guarda";

const TAMANHO_MAXIMO = 100;

/** GET /api/dex/registros?local=&busca=&pagina=&tamanhoPagina= — mais recentes primeiro. */
export async function GET(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const q = new URL(req.url).searchParams;
  const inteiro = (nome: string, padrao: number) => {
    const n = Number(q.get(nome));
    return Number.isInteger(n) && n > 0 ? n : padrao;
  };
  const resultado = await listarRegistros(db, {
    local: q.get("local") || undefined,
    busca: q.get("busca") || undefined,
    pagina: inteiro("pagina", 1),
    tamanhoPagina: Math.min(inteiro("tamanhoPagina", 50), TAMANHO_MAXIMO),
  });
  return NextResponse.json(resultado);
}

/** POST /api/dex/registros — um Pokémon novo. Recusas de validação vêm todas juntas. */
export async function POST(req: Request) {
  const desligado = respostaSeModuloDesligado();
  if (desligado) return desligado;

  const dados = lerDadosRegistro(await lerCorpoJson(req));
  if (typeof dados === "string") return NextResponse.json({ erro: dados }, { status: 400 });

  const r = await criarRegistro(db, dados);
  if (!r.ok) return NextResponse.json(corpoDasRecusas(r.recusas), { status: 400 });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}
