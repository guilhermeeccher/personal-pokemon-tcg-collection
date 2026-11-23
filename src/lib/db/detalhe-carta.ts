/**
 * As consultas do detalhe de carta da v2 (`GET /api/cartas/:cartaId/detalhe`).
 * O que escolher e como montar está em `lib/dominio/detalhe-carta.ts`; aqui só
 * se lê, numa transação só de leitura REPEATABLE READ: as cópias e onde cada
 * uma está alocada são do mesmo instante.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import { imagemDaCarta, origemDaImagem } from "./consultas";
import {
  cartaCatalogo,
  colecao,
  copia,
  precoCandidataCardmarket,
  precoCartaCardmarket,
  precoCartaCardmarketHistorico,
  precoCartaLiga,
  precoCartaLigaHistorico,
  vaga,
} from "./schema";
import {
  cartaTemPrecoDeInventario,
  escolherFichaDoDetalhe,
  raridadeCanonicaDaFicha,
  PONTOS_SERIE_CURTA,
  precoDoDetalhe,
  serieCurta,
  type LinhaPrecoCardmarket,
  type PontoBruto,
} from "@/lib/dominio/detalhe-carta";
import type { Idioma } from "@/lib/dominio/enums";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import { urlImagemCarta } from "@/lib/imagens";

const numero = (v: string | null) => (v === null ? null : Number(v));

async function fichasDaCarta(tx: Transacao, cartaId: string) {
  const linhas = await tx
    .select({
      cartaId: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      nome: cartaCatalogo.nome,
      setId: cartaCatalogo.setId,
      setNome: cartaCatalogo.setNome,
      setSigla: cartaCatalogo.setSigla,
      setQtdOficial: cartaCatalogo.setQtdOficial,
      localId: cartaCatalogo.localId,
      raridade: cartaCatalogo.raridade,
      tipos: cartaCatalogo.tipos,
      ilustrador: cartaCatalogo.ilustrador,
      dexIds: cartaCatalogo.dexIds,
      ativa: cartaCatalogo.ativa,
      varianteNormalDisponivel: cartaCatalogo.varianteNormalDisponivel,
      varianteReverseDisponivel: cartaCatalogo.varianteReverseDisponivel,
      varianteHoloDisponivel: cartaCatalogo.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel: cartaCatalogo.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: cartaCatalogo.variantePromoDisponivel,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
    })
    .from(cartaCatalogo)
    .where(eq(cartaCatalogo.id, cartaId));
  return linhas.map((l) => ({ ...l, imagemOrigem: (l.imagemOrigem as OrigemImagem | null) ?? null }));
}

/**
 * Todas as cópias da carta física — de qualquer ficha (pt, en ou jp do mesmo
 * `carta_id`) e de qualquer idioma físico (regra 7) —, com onde cada uma está
 * alocada. Uma cópia ocupa no máximo uma vaga (regra 1), então o `LEFT JOIN`
 * não duplica linha.
 */
async function copiasDaCarta(tx: Transacao, cartaId: string) {
  const linhas = await tx
    .select({
      id: copia.id,
      idiomaCatalogo: copia.idiomaCatalogo,
      idioma: copia.idioma,
      variante: copia.variante,
      quantidade: copia.quantidade,
      condicao: copia.condicao,
      gradedEmpresa: copia.gradedEmpresa,
      gradedNota: copia.gradedNota,
      gradedCertificado: copia.gradedCertificado,
      localizacao: copia.localizacao,
      aquisicaoData: copia.aquisicaoData,
      aquisicaoOrigem: copia.aquisicaoOrigem,
      aquisicaoPreco: copia.aquisicaoPreco,
      notas: copia.notas,
      criadoEm: copia.criadoEm,
      vagaId: vaga.id,
      vagaChave: vaga.chave,
      vagaDesde: vaga.atualizadoEm,
      colecaoId: colecao.id,
      colecaoNome: colecao.nome,
      colecaoTipo: colecao.tipo,
    })
    .from(copia)
    .leftJoin(vaga, eq(vaga.copiaId, copia.id))
    .leftJoin(colecao, eq(colecao.id, vaga.colecaoId))
    .where(eq(copia.cartaId, cartaId))
    .orderBy(asc(copia.criadoEm), asc(copia.id));

  return linhas.map((l) => ({
    id: l.id,
    idiomaCatalogo: l.idiomaCatalogo,
    idioma: l.idioma,
    variante: l.variante,
    quantidade: l.quantidade,
    condicao: l.condicao,
    gradedEmpresa: l.gradedEmpresa,
    gradedNota: l.gradedNota,
    gradedCertificado: l.gradedCertificado,
    localizacao: l.localizacao,
    aquisicaoData: l.aquisicaoData,
    aquisicaoOrigem: l.aquisicaoOrigem,
    aquisicaoPreco: l.aquisicaoPreco,
    notas: l.notas,
    /**
     * Quando a linha foi cadastrada. Não é a data de chegada da unidade: a
     * divisão de lote e a fusão no cadastro não a preservam como tal.
     */
    criadoEm: l.criadoEm.toISOString(),
    alocacao:
      l.vagaId !== null && l.vagaChave !== null && l.colecaoId !== null && l.colecaoNome !== null && l.colecaoTipo !== null && l.vagaDesde !== null
        ? {
            vagaId: l.vagaId,
            chave: l.vagaChave,
            numero: rotuloChaveVaga(l.vagaChave),
            colecaoId: l.colecaoId,
            colecaoNome: l.colecaoNome,
            colecaoTipo: l.colecaoTipo,
            desde: l.vagaDesde.toISOString(),
          }
        : null,
  }));
}

async function precoCardmarketDoInventario(tx: Transacao, cartaId: string): Promise<LinhaPrecoCardmarket | null> {
  const [l] = await tx.select().from(precoCartaCardmarket).where(eq(precoCartaCardmarket.cartaId, cartaId)).limit(1);
  if (!l) return null;
  return {
    encontrada: l.encontrada,
    valor: numero(l.valor),
    valorEur: numero(l.valorEur),
    criterioValor: l.criterioValor,
    tendenciaEur: numero(l.tendenciaEur),
    cotacao: numero(l.cotacao),
    cotacaoData: l.cotacaoData,
    // "Não achada" nunca sobrescreve a linha achada (o `setWhere` da
    // gravação), então `consultado_em` é a leitura do preço guardado.
    em: l.consultadoEm,
  };
}

async function precoCardmarketDeCandidata(tx: Transacao, cartaId: string): Promise<LinhaPrecoCardmarket | null> {
  const [l] = await tx
    .select()
    .from(precoCandidataCardmarket)
    .where(eq(precoCandidataCardmarket.cartaId, cartaId))
    .limit(1);
  if (!l) return null;
  return {
    encontrada: l.encontrada,
    valor: numero(l.valor),
    valorEur: numero(l.valorEur),
    criterioValor: l.criterioValor,
    tendenciaEur: numero(l.tendenciaEur),
    cotacao: numero(l.cotacao),
    cotacaoData: l.cotacaoData,
    // Aqui são dois instantes: `preco_em` é quando o preço guardado foi lido.
    em: l.precoEm,
  };
}

async function precoLigaDoInventario(tx: Transacao, cartaId: string) {
  const [l] = await tx.select().from(precoCartaLiga).where(eq(precoCartaLiga.cartaId, cartaId)).limit(1);
  if (!l) return null;
  return {
    encontrada: l.encontrada,
    minimo: numero(l.preco),
    medio: numero(l.precoMedio),
    maximo: numero(l.precoMaximo),
    em: l.consultadoEm,
  };
}

/** Os pontos mais recentes com preço do histórico da fonte ativa, da régua dela. */
async function historicoDaFonte(tx: Transacao, cartaId: string, fonte: FontePreco): Promise<PontoBruto[]> {
  if (fonte === "cardmarket") {
    const linhas = await tx
      .select({
        em: precoCartaCardmarketHistorico.consultadoEm,
        valor: precoCartaCardmarketHistorico.valor,
      })
      .from(precoCartaCardmarketHistorico)
      .where(
        and(
          eq(precoCartaCardmarketHistorico.cartaId, cartaId),
          eq(precoCartaCardmarketHistorico.encontrada, true),
        ),
      )
      .orderBy(desc(precoCartaCardmarketHistorico.consultadoEm))
      .limit(PONTOS_SERIE_CURTA);
    return linhas.map((l) => ({ em: l.em, encontrada: true, valor: numero(l.valor) }));
  }
  const linhas = await tx
    .select({
      em: precoCartaLigaHistorico.consultadoEm,
      minimo: precoCartaLigaHistorico.preco,
      medio: precoCartaLigaHistorico.precoMedio,
    })
    .from(precoCartaLigaHistorico)
    .where(and(eq(precoCartaLigaHistorico.cartaId, cartaId), eq(precoCartaLigaHistorico.encontrada, true)))
    .orderBy(desc(precoCartaLigaHistorico.consultadoEm))
    .limit(PONTOS_SERIE_CURTA);
  // A régua da Liga é a mesma do preço do detalhe e das joias: médio, senão menor.
  return linhas.map((l) => ({ em: l.em, encontrada: true, valor: numero(l.medio) ?? numero(l.minimo) }));
}

/** A vaga que abriu o detalhe, quando houver. */
async function vagaDoContexto(tx: Transacao, vagaId: string) {
  const [l] = await tx
    .select({
      id: vaga.id,
      chave: vaga.chave,
      copiaId: vaga.copiaId,
      colecaoId: colecao.id,
      colecaoNome: colecao.nome,
      colecaoTipo: colecao.tipo,
    })
    .from(vaga)
    .innerJoin(colecao, eq(colecao.id, vaga.colecaoId))
    .where(eq(vaga.id, vagaId))
    .limit(1);
  return l ? { ...l, numero: rotuloChaveVaga(l.chave) } : null;
}

export type ResultadoDetalhe =
  | { ok: true; detalhe: Awaited<ReturnType<typeof montar>> }
  | { ok: false; motivo: "carta" | "vaga" | "copia" };

async function montar(
  tx: Transacao,
  cartaId: string,
  fonte: FontePreco,
  fichas: Awaited<ReturnType<typeof fichasDaCarta>>,
  idiomaPedido: Idioma | null,
  copias: Awaited<ReturnType<typeof copiasDaCarta>>,
  contexto: { vaga: Awaited<ReturnType<typeof vagaDoContexto>>; copiaId: string | null },
) {
  const ficha = escolherFichaDoDetalhe(fichas, idiomaPedido);
  // Quem chama já conferiu que há ficha; toda ficha é pt, en ou jp.
  if (!ficha) throw new Error(`detalhe: a carta ${cartaId} não tem ficha de exibição`);
  const possuida = copias.length > 0;
  const especial = cartaTemPrecoDeInventario(fichas);
  const temHistorico = possuida && especial;

  const preco = precoDoDetalhe({
    fonte,
    possuida,
    especial,
    inventarioCardmarket:
      possuida && especial && fonte === "cardmarket" ? await precoCardmarketDoInventario(tx, cartaId) : null,
    inventarioLiga: possuida && especial && fonte === "liga" ? await precoLigaDoInventario(tx, cartaId) : null,
    candidataCardmarket: !possuida && fonte === "cardmarket" ? await precoCardmarketDeCandidata(tx, cartaId) : null,
  });
  const serie = serieCurta(fonte, temHistorico, temHistorico ? await historicoDaFonte(tx, cartaId, fonte) : []);

  return {
    carta: {
      cartaId: ficha.cartaId,
      idioma: ficha.idioma,
      /** As fichas que a carta tem no catálogo, na ordem pt, en, jp. */
      idiomas: (["pt", "en", "jp"] as const).filter((i) => fichas.some((f) => f.idioma === i)),
      nome: ficha.nome,
      setId: ficha.setId,
      setNome: ficha.setNome,
      setSigla: ficha.setSigla,
      setQtdOficial: ficha.setQtdOficial,
      localId: ficha.localId,
      raridade: ficha.raridade,
      /** Para rotular: a da ficha en do mesmo `carta_id`, senão a gravada (`raridadeCanonicaDaFicha`). */
      raridadeCanonica: raridadeCanonicaDaFicha(ficha, fichas),
      tipos: ficha.tipos,
      ilustrador: ficha.ilustrador,
      dexIds: ficha.dexIds,
      ativa: ficha.ativa,
      imagemUrl: ficha.imagemUrl,
      /** A foto em alta (`urlImagemCarta(…, "high")`); a foto própria já é o arquivo final. */
      imagemAlta: urlImagemCarta(ficha.imagemUrl, "high"),
      imagemOrigem: ficha.imagemOrigem,
      varianteNormalDisponivel: ficha.varianteNormalDisponivel,
      varianteReverseDisponivel: ficha.varianteReverseDisponivel,
      varianteHoloDisponivel: ficha.varianteHoloDisponivel,
      variantePrimeiraEdicaoDisponivel: ficha.variantePrimeiraEdicaoDisponivel,
      variantePromoDisponivel: ficha.variantePromoDisponivel,
    },
    /** Entra nas rodadas de preço do inventário quando possuída (não é comum nem incomum). */
    especial,
    copias,
    preco,
    serie,
    contexto: {
      vaga: contexto.vaga,
      copiaId: contexto.copiaId,
    },
  };
}

/**
 * O detalhe de uma carta. `idioma` pede a ficha a mostrar; `copiaId` (uma
 * cópia desta carta) a decide pela ficha da cópia; `vagaId` só acrescenta a
 * vaga que abriu o detalhe.
 */
export async function lerDetalheDaCarta(
  db: Database,
  cartaId: string,
  fonte: FontePreco,
  pedido: { idioma: Idioma | null; vagaId: string | null; copiaId: string | null },
): Promise<ResultadoDetalhe> {
  return db.transaction(
    async (tx): Promise<ResultadoDetalhe> => {
      const fichas = await fichasDaCarta(tx, cartaId);
      if (fichas.length === 0) return { ok: false, motivo: "carta" };

      const copias = await copiasDaCarta(tx, cartaId);
      let idioma = pedido.idioma;
      if (pedido.copiaId !== null) {
        const daCopia = copias.find((c) => c.id === pedido.copiaId);
        if (!daCopia) return { ok: false, motivo: "copia" };
        idioma = daCopia.idiomaCatalogo;
      }
      const vagaContexto = pedido.vagaId === null ? null : await vagaDoContexto(tx, pedido.vagaId);
      if (pedido.vagaId !== null && vagaContexto === null) return { ok: false, motivo: "vaga" };

      return {
        ok: true,
        detalhe: await montar(tx, cartaId, fonte, fichas, idioma, copias, {
          vaga: vagaContexto,
          copiaId: pedido.copiaId,
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
