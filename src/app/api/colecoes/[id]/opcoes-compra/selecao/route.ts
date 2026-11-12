import { NextResponse } from "next/server";

import { comAcesso } from "@/lib/acesso";
import { db } from "@/lib/db/client";
import { obterColecaoPorId } from "@/lib/db/consultas";
import {
  desmarcarEscolhas,
  escolhasPorId,
  marcarEscolhas,
  type EscolhaNova,
} from "@/lib/db/escolhas";
import { obterUltimaVarredura, opcoesPorId } from "@/lib/db/liga";
import { listarCandidatasDaColecao } from "@/lib/db/candidatas-compra";
import { listarEscolhas } from "@/lib/db/escolhas";
import { identidadeDaCarta } from "@/lib/dominio/identidade-carta";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";
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
 * está no cabeçalho da tabela: o usuário marcou 126 cartas da Pokédex, uma
 * por vaga vazia, e a próxima atualização de preço apagaria as 126.
 *
 * Corpo: `{ ids: string[], selecionada: boolean }`. Ao **marcar**, os ids são
 * de `liga_opcao` — é de lá que vêm os dados que a escolha guarda. Ao
 * **desmarcar**, valem ids de `liga_opcao` ou de `escolha_compra`: a lista de
 * compras existe sem varredura nenhuma, e o usuário precisa poder tirar carta
 * dela sem rodar uma busca antes.
 *
 * **Com `PRECO_FONTE=cardmarket` as opções saem do catálogo** (ver a rota de
 * opções), e a marcação vem como `{ cartas: [{ chave, cartaId }],
 * selecionada }`. Marcar confere que a carta é candidata de uma vaga vazia
 * desta coleção — regra 2 na Pokédex, a carta da vaga no set — e grava a
 * escolha com a linha da Liga tirada do catálogo, sem preço: o preço dela é
 * lido na hora da fonte ativa, e o da Liga não se mistura. Desmarcar apaga as
 * escolhas daquela vaga com aquela carta. `ids` de escolha continuam valendo
 * para desmarcar a escolha avulsa.
 */
export const PATCH = comAcesso(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const bruto = corpo as { ids?: unknown; cartas?: unknown; selecionada?: unknown };
  if (bruto.cartas !== undefined && fonteDePreco() === "cardmarket") {
    return marcarCandidatas(colecao, bruto.cartas, bruto.selecionada);
  }
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
    // varredura); o que sobrar, resolve pelas opções da coleção.
    const alvos = [...(await escolhasPorId(db, id, ids))];

    if (alvos.length < ids.length) {
      for (const o of await opcoesPorId(db, id, ids)) {
        alvos.push({ chave: o.chave, identidade: identidadeDaCarta(o) });
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

  // Escopo da coleção, não da última varredura: a tela mostra, vaga a vaga, a
  // opção da rodada mais recente que achou algo (`listarOpcoesMaisRecentesPorVaga`).
  const opcoes = await opcoesPorId(db, id, ids);
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
});

/** No máximo isto por pedido: "marcar a melhor de cada vaga" de uma Pokédex inteira cabe. */
const MAXIMO_CARTAS_POR_PEDIDO = 1100;

async function marcarCandidatas(
  colecao: { id: string; tipo: string; parametro: unknown },
  cartas: unknown,
  selecionada: unknown,
) {
  if (
    !Array.isArray(cartas) ||
    cartas.length > MAXIMO_CARTAS_POR_PEDIDO ||
    cartas.some(
      (c) =>
        typeof c !== "object" ||
        c === null ||
        typeof (c as Record<string, unknown>).chave !== "string" ||
        typeof (c as Record<string, unknown>).cartaId !== "string",
    ) ||
    typeof selecionada !== "boolean"
  ) {
    return NextResponse.json(
      { erro: "Esperado { cartas: { chave: string, cartaId: string }[], selecionada: boolean }." },
      { status: 400 },
    );
  }
  const pares = new Set((cartas as Array<{ chave: string; cartaId: string }>).map((c) => `${c.chave}|${c.cartaId}`));

  if (!selecionada) {
    const alvos = (await listarEscolhas(db, colecao.id)).filter(
      (e) => e.cartaId !== null && pares.has(`${e.chave}|${e.cartaId}`),
    );
    return NextResponse.json({ alteradas: await desmarcarEscolhas(db, colecao.id, alvos) });
  }

  // Só o que é candidata de uma vaga vazia: a tela nunca manda outra coisa, e
  // uma carta de outra espécie na vaga quebraria a regra 2 em silêncio.
  const novas: EscolhaNova[] = (await listarCandidatasDaColecao(db, colecao)).flatMap((v) =>
    v.candidatas
      .filter((c) => pares.has(`${v.chave}|${c.cartaId}`))
      .map((c) => ({
        chave: v.chave,
        especie: v.especie,
        nome: c.nome,
        edicaoSigla: c.edicaoSigla,
        edid: null,
        edicaoNome: c.edicaoNome,
        numero: c.numero,
        total: c.total,
        caminho: c.caminho,
        cartaId: c.cartaId,
        idiomaCatalogo: c.idiomaCatalogo,
        preco: null,
      })),
  );
  return NextResponse.json({ alteradas: await marcarEscolhas(db, colecao.id, novas) });
}
