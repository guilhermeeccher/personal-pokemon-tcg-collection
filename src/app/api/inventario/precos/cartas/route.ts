import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerCartasDaTabelaPrecos } from "@/lib/db/cartas-da-tabela-precos";
import { MAXIMO_CARTAS_POR_PEDIDO, idsParaPedir } from "@/lib/dominio/precos-v2";
import { corpoRecusa } from "@/lib/dominio/recusa";

/**
 * GET /api/inventario/precos/cartas?id=<carta_id>&id=<carta_id>… — a foto e a
 * cópia que abre o detalhe de cada carta da página da tabela de preços da v2
 * (`/inventario/precos`, pacote 2d). `GET /api/inventario/precos` traz as linhas
 * de preço, que não têm imagem nem cópia; a tela pede isto só para as cartas da
 * página que está aberta, e de novo só quando a página muda.
 *
 * Só lê: dois `select`, limitados aos ids pedidos (no máximo 100). Não fala com
 * a Liga nem com a TCGdex e não toca em nenhuma rodada.
 */
export const GET = comAcesso(async function GET(req: Request) {
  const pedidos = new URL(req.url).searchParams.getAll("id");
  // Mais ids do que o teto, ou um id enorme, não é uma página da tabela.
  if (pedidos.length === 0 || pedidos.length > MAXIMO_CARTAS_POR_PEDIDO || pedidos.some((id) => id.length > 100)) {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }
  const cartas = await lerCartasDaTabelaPrecos(db, idsParaPedir(pedidos));
  return NextResponse.json({ cartas });
});
