import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { lerDetalheDaCarta } from "@/lib/db/detalhe-carta";
import { ehIdioma } from "@/lib/dominio/enums";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
import { corpoRecusa } from "@/lib/dominio/recusa";
import type { DetalheCartaV2DTO } from "@/lib/dominio/tipos-cliente";
import { ehUuid } from "@/lib/dominio/uuid";

/**
 * GET /api/cartas/:cartaId/detalhe — o detalhe de uma carta para a v2, numa
 * resposta só: a ficha (nome, set, número, raridade, tipos, ilustrador, a foto
 * e a foto em alta, as variantes que existem), todas as cópias do usuário
 * daquela carta com onde cada uma está alocada, o preço na fonte da
 * instalação (ou o motivo de não haver) e a série curta de preço, quando a
 * carta é possuída e especial.
 *
 * Parâmetros opcionais: `idioma` (pt, en, jp) pede a ficha a mostrar;
 * `copia=<id>` abre pelo lado da cópia (precisa ser uma cópia desta carta, e
 * a ficha passa a ser a dela); `vaga=<id>` diz de que vaga o detalhe foi
 * aberto. Alocar, trocar, desalocar e editar continuam nas rotas que já
 * existem.
 *
 * Só lê. A decisão de qual preço mostrar e o porquê estão em
 * `lib/dominio/detalhe-carta.ts`; o contrato, em `docs/design-v2/`.
 */
export const GET = comAcesso(async function GET(
  req: Request,
  { params }: { params: Promise<{ cartaId: string }> },
) {
  const { cartaId } = await params;
  const busca = new URL(req.url).searchParams;
  const idioma = busca.get("idioma");
  const vagaId = busca.get("vaga");
  const copiaId = busca.get("copia");

  // Id de carta do catálogo é curto; um texto enorme não existe no banco.
  if (cartaId.length === 0 || cartaId.length > 100) {
    return NextResponse.json(
      corpoRecusa("cartaNaoEncontradaNoCatalogo", { cartaId: cartaId.slice(0, 100), idioma: idioma ?? "" }),
      { status: 404 },
    );
  }
  if (
    (idioma !== null && !ehIdioma(idioma)) ||
    (vagaId !== null && !ehUuid(vagaId)) ||
    (copiaId !== null && !ehUuid(copiaId))
  ) {
    return NextResponse.json(corpoRecusa("corpoInvalido"), { status: 400 });
  }

  const resultado = await lerDetalheDaCarta(db, cartaId, fonteDePreco(), {
    idioma: idioma !== null && ehIdioma(idioma) ? idioma : null,
    vagaId: vagaId === null ? null : vagaId.toLowerCase(),
    copiaId: copiaId === null ? null : copiaId.toLowerCase(),
  });
  if (!resultado.ok) {
    const recusa =
      resultado.motivo === "vaga"
        ? corpoRecusa("vagaNaoEncontrada")
        : resultado.motivo === "copia"
          ? corpoRecusa("copiaNaoEncontrada")
          : corpoRecusa("cartaNaoEncontradaNoCatalogo", { cartaId, idioma: idioma ?? "" });
    return NextResponse.json(recusa, { status: 404 });
  }
  const detalhe: DetalheCartaV2DTO = resultado.detalhe;
  return NextResponse.json(detalhe);
});
