/**
 * "Suas cartas que cabem neste tema" — a lista de uma coleção temática e o
 * lote que aloca o que o usuário marcou (decisão de 2026-11-22). Filtrar,
 * ordenar e marcar são de `lib/dominio/cartas-do-tema.ts`; aqui só se lê e se
 * grava.
 *
 * O lote passa pelo caminho de alocação da customizada
 * (`adicionarCopiaCustomizadaNaTransacao`): cada cópia ganha a sua vaga com
 * chave sequencial, com a mesma divisão de lote e a mesma checagem de idioma
 * exigido de uma adição avulsa. Tudo numa transação, e sob a trava o lote
 * confere o que a prévia mostrou de cada cópia (`conferirPedidoComEstado`): uma
 * cópia que outra aba alocou, dividiu ou apagou no meio do caminho, ou uma
 * carta que entrou na coleção depois da prévia, recusa o lote inteiro (409), e
 * nada fica gravado.
 */

import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import {
  adicionarCopiaCustomizadaNaTransacao,
  imagemDaCarta,
  obterNomesEspeciePorNumero,
  origemDaImagem,
  raridadeEnDaCarta,
  recusaDeUnicidadeDaCustomizada,
  travarColecaoCustomizada,
} from "./consultas";
import { cartaCatalogo, colecao, copia, vaga } from "./schema";
import {
  conferirPedidoComEstado,
  contarCartasNovas,
  filtrarCopiasDoTema,
  marcarUmaPorCarta,
  ordenarCartasDoTema,
  type EstadoCopiaDoPedido,
  type PedidoCartasDoTema,
} from "@/lib/dominio/cartas-do-tema";
import { ehForaDePadrao } from "@/lib/dominio/elegibilidade-vaga";
import { recusa, type Recusa } from "@/lib/dominio/recusa";
import { temaDaColecao, type TemaColecao } from "@/lib/dominio/tema-colecao";
import type { CartaDoTemaDTO, CartasDoTemaDTO } from "@/lib/dominio/tipos-cliente";

export type FalhaTema = { ok: false; motivo: Recusa; status: 400 | 404 | 409 };

const colecaoNaoEncontrada = (): FalhaTema => ({ ok: false, motivo: recusa("colecaoNaoEncontrada"), status: 404 });
const colecaoSemTema = (): FalhaTema => ({ ok: false, motivo: recusa("colecaoSemTema"), status: 400 });

/** As colunas da linha de catálogo que o casamento com o tema lê. */
const colunasDoTema = {
  dexIds: cartaCatalogo.dexIds,
  tipos: cartaCatalogo.tipos,
  ilustrador: cartaCatalogo.ilustrador,
  raridade: cartaCatalogo.raridade,
  raridadeEn: raridadeEnDaCarta(copia.cartaId),
  forma: cartaCatalogo.forma,
};

const juncaoCatalogo = and(
  eq(copia.cartaId, cartaCatalogo.id),
  eq(copia.idiomaCatalogo, cartaCatalogo.idioma),
);

/**
 * `GET /api/colecoes/:id/cartas-do-tema`: as cópias livres que cabem no tema,
 * em ordem, com a marcação padrão. Só lê — nunca aloca.
 */
export async function listarCartasDoTema(
  db: Database,
  colecaoId: string,
): Promise<{ ok: true; resultado: CartasDoTemaDTO } | FalhaTema> {
  const [linhaColecao] = await db
    .select({ tipo: colecao.tipo, parametro: colecao.parametro, idiomaExigido: colecao.idiomaExigido })
    .from(colecao)
    .where(eq(colecao.id, colecaoId))
    .limit(1);
  if (!linhaColecao) return colecaoNaoEncontrada();
  const tema = temaDaColecao(linhaColecao);
  if (!tema) return colecaoSemTema();

  const alocadas = db.select({ copiaId: vaga.copiaId }).from(vaga).where(isNotNull(vaga.copiaId));
  // Leve primeiro: o filtro do tema é do domínio, e a imagem (subconsulta
  // correlacionada) só é calculada para quem passou nele.
  const [livres, naColecao] = await Promise.all([
    db
      .select({
        copiaId: copia.id,
        cartaId: copia.cartaId,
        idiomaCatalogo: copia.idiomaCatalogo,
        idioma: copia.idioma,
        quantidade: copia.quantidade,
        criadoEm: copia.criadoEm,
        setId: cartaCatalogo.setId,
        setLancamento: cartaCatalogo.setLancamento,
        localId: cartaCatalogo.localId,
        ...colunasDoTema,
      })
      .from(copia)
      .innerJoin(cartaCatalogo, juncaoCatalogo)
      .where(and(notInArray(copia.id, alocadas), inArray(copia.idiomaCatalogo, ["pt", "en"]))),
    db
      .selectDistinct({ cartaId: copia.cartaId })
      .from(vaga)
      .innerJoin(copia, eq(vaga.copiaId, copia.id))
      .where(eq(vaga.colecaoId, colecaoId)),
  ]);

  const cabem = ordenarCartasDoTema(
    filtrarCopiasDoTema(
      livres.map((l) => ({
        ...l,
        criadoEm: l.criadoEm.toISOString(),
        foraDePadrao: ehForaDePadrao(linhaColecao.idiomaExigido, l.idioma),
      })),
      tema,
    ),
  );
  const marcadas = marcarUmaPorCarta(cabem, new Set(naColecao.map((c) => c.cartaId)));
  const temaRotulo = await rotuloDoTema(db, tema);
  const comRotulo = temaRotulo !== undefined ? { temaRotulo } : {};
  if (marcadas.length === 0) return { ok: true, resultado: { tema, ...comRotulo, cartasNovas: 0, cartas: [] } };

  const detalhes = await db
    .select({
      copiaId: copia.id,
      variante: copia.variante,
      condicao: copia.condicao,
      cartaNome: cartaCatalogo.nome,
      setNome: cartaCatalogo.setNome,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
    })
    .from(copia)
    .innerJoin(cartaCatalogo, juncaoCatalogo)
    .where(inArray(copia.id, marcadas.map((m) => m.copiaId)));
  const porCopia = new Map(detalhes.map((d) => [d.copiaId, d]));

  const cartas: CartaDoTemaDTO[] = marcadas.flatMap((m) => {
    const d = porCopia.get(m.copiaId);
    if (!d) return [];
    return [
      {
        copiaId: m.copiaId,
        cartaId: m.cartaId,
        idiomaCatalogo: m.idiomaCatalogo,
        idioma: m.idioma,
        variante: d.variante,
        condicao: d.condicao,
        // A quantidade da mesma leitura que decidiu a lista: é ela que o
        // pedido devolve, e o lote confere sob a trava.
        quantidade: m.quantidade,
        cartaNome: d.cartaNome,
        cartaLocalId: m.localId,
        setId: m.setId,
        setNome: d.setNome,
        imagemUrl: d.imagemUrl,
        imagemOrigem: d.imagemOrigem,
        foraDePadrao: m.foraDePadrao,
        jaNaColecao: m.jaNaColecao,
        marcadaPorPadrao: m.marcadaPorPadrao,
      },
    ];
  });
  return { ok: true, resultado: { tema, ...comRotulo, cartasNovas: contarCartasNovas(cartas), cartas } };
}

/** O nome da espécie de um tema de espécie, para a tela rotular sem adivinhar; nos outros, nada. */
async function rotuloDoTema(db: Database, tema: TemaColecao): Promise<string | undefined> {
  if (tema.tipo !== "especie") return undefined;
  const numero = Number(tema.valor);
  return (await obterNomesEspeciePorNumero(db, [numero])).get(numero) ?? undefined;
}

/** Recusa que sai de dentro do lote por exceção: um `return` fecharia a transação com sucesso. */
class RecusaNoLote extends Error {
  constructor(readonly falha: FalhaTema) {
    super(falha.motivo.chave);
  }
}

/** O status de uma recusa da adição: o que outra aba mudou é 409; o resto, 400. */
function statusDaRecusa(motivo: Recusa): 400 | 409 {
  return ["copiaJaAlocada", "copiaNaoEncontrada", "conflitoAoGerarProximaVaga"].includes(motivo.chave) ? 409 : 400;
}

/**
 * Trava as cópias do pedido **em ordem de UUID** e lê o estado de cada uma: o
 * lote e a linha de catálogo. A ordem fixa é o que impede dois lotes de
 * coleções diferentes, com cópias em comum, de se travarem um ao outro
 * (deadlock): os dois pegam as travas na mesma sequência. As travas ficam até o
 * fim da transação, então a alocação de cada cópia (que trava de novo) não
 * espera ninguém.
 */
async function travarEstadoDasCopias(
  tx: Transacao,
  copiaIds: readonly string[],
): Promise<Map<string, EstadoCopiaDoPedido & { copiaId: string }>> {
  const linhas = await tx
    .select({
      copiaId: copia.id,
      cartaId: copia.cartaId,
      idiomaCatalogo: copia.idiomaCatalogo,
      quantidade: copia.quantidade,
      ...colunasDoTema,
    })
    .from(copia)
    .innerJoin(cartaCatalogo, juncaoCatalogo)
    .where(inArray(copia.id, [...copiaIds]))
    .orderBy(asc(copia.id))
    .for("update", { of: copia });
  return new Map(linhas.map((l) => [l.copiaId, l]));
}

/**
 * `POST /api/colecoes/:id/cartas-do-tema`: aloca as cópias pedidas na coleção
 * temática, uma vaga por cópia, na ordem do pedido — tudo ou nada.
 */
export async function alocarCartasDoTema(
  db: Database,
  colecaoId: string,
  pedido: PedidoCartasDoTema,
): Promise<{ ok: true; vagas: { copiaId: string; vagaId: string; chave: string }[] } | FalhaTema> {
  try {
    return await db.transaction(async (tx) => {
      const travada = await travarColecaoCustomizada(tx, colecaoId);
      if (!travada.ok) {
        return travada.motivo.chave === "colecaoNaoEncontrada" ? colecaoNaoEncontrada() : colecaoSemTema();
      }
      const tema = temaDaColecao(travada.colecao);
      if (!tema) return colecaoSemTema();
      // Sob a trava da coleção e das cópias: o que a prévia mostrou ainda vale?
      const estado = await travarEstadoDasCopias(tx, pedido.itens.map((i) => i.copiaId));
      const naColecao = await tx
        .selectDistinct({ cartaId: copia.cartaId })
        .from(vaga)
        .innerJoin(copia, eq(vaga.copiaId, copia.id))
        .where(eq(vaga.colecaoId, colecaoId));
      const falha = conferirPedidoComEstado(
        pedido.itens,
        estado,
        new Set(naColecao.map((c) => c.cartaId)),
        tema,
      );
      if (falha) return { ok: false as const, motivo: falha.recusa, status: falha.status };

      // Daqui em diante há escrita: uma recusa desfaz o lote inteiro.
      const vagas: { copiaId: string; vagaId: string; chave: string }[] = [];
      for (const { copiaId } of pedido.itens) {
        const r = await adicionarCopiaCustomizadaNaTransacao(tx, travada.colecao, copiaId, {
          permitirForaDePadrao: pedido.permitirForaDePadrao,
        });
        if (!r.ok) throw new RecusaNoLote({ ok: false, motivo: r.motivo, status: statusDaRecusa(r.motivo) });
        vagas.push({ copiaId, vagaId: r.vagaId, chave: r.chave });
      }
      return { ok: true as const, vagas };
    });
  } catch (err) {
    if (err instanceof RecusaNoLote) return err.falha;
    const motivo = recusaDeUnicidadeDaCustomizada(err);
    if (motivo) return { ok: false, motivo, status: 409 };
    throw err;
  }
}
