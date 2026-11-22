/**
 * As consultas do "o que falta" da v2 (`GET /api/colecoes/:id/falta` e
 * `.../falta/alternativas`). A montagem é pura, em
 * `lib/dominio/falta-colecao.ts`; as opções saem da mesma montagem da tela de
 * opções de compra (`lib/liga/opcoes-da-colecao.ts`): a mesma marcação, o
 * mesmo filtro de sem estoque com a exceção da marcada, e a mesma lista em
 * abas.
 *
 * Só lê, numa transação `read only` REPEATABLE READ (ver `SO_LEITURA`). Ao
 * contrário do `GET` de opções, não fecha rodada morta: uma rodada
 * parada por reinício aparece como está no banco até a tela de opções, ou um
 * disparo novo, fechá-la.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database, Transacao } from "./client";
import {
  listarCandidatasDaColecao,
  ultimaRodadaDeCandidatas,
  type PrecoCandidata,
  type VagaComCandidatas,
} from "./candidatas-compra";
import { contarCandidatosPorVagaVazia, imagemDaCarta, origemDaImagem } from "./consultas";
import { listarEscolhas, type EscolhaSalva } from "./escolhas";
import { obterUltimaVarredura, type VarreduraSalva } from "./liga";
import { cartaCatalogo, ligaOpcao, vaga } from "./schema";
import { filtrarCandidatas } from "@/lib/dominio/candidatas-compra";
import { compararChavesVaga } from "@/lib/dominio/chave-vaga-set";
import type { Idioma } from "@/lib/dominio/enums";
import {
  montarVagasDaFalta,
  opcaoDaCandidata,
  opcaoDaVarredura,
  type CriterioDaProposta,
  type EscolhaDaVagaFalta,
  type OpcaoFalta,
  type OpcoesDaVagaFalta,
  type PrecoReferencia,
  type VagaFalta,
} from "@/lib/dominio/falta-colecao";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import { FILTROS_PADRAO, FILTROS_PADRAO_SET, type Ordenacao } from "@/lib/dominio/liga-opcoes";
import { precoDaOpcao, resumirPrecosDasCandidatas } from "@/lib/dominio/opcoes-compra-vaga";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import type { PrecoDaEscolha } from "@/lib/liga/lista-compra";
import {
  opcoesDaVarreduraPorVaga,
  opcoesDasCandidatasPorVaga,
  resumoDaListaDeCompra,
  vagasParaAgrupar,
} from "@/lib/liga/opcoes-da-colecao";

type TipoComVaga = "pokedex" | "set";

export interface ColecaoDaFalta {
  id: string;
  tipo: TipoComVaga;
  parametro: unknown;
}

/** O critério que a tela pediu (`lerCriterioDaUrl`); só vale na fonte Cardmarket. */
export interface CriterioPedido {
  ordenacao: Ordenacao;
  tetoPreco: number | null;
  pedido: boolean;
}

/** O padrão da tela de opções para o tipo — o que vale sem critério na URL. */
export function criterioPadrao(tipo: TipoComVaga): { ordenacao: Ordenacao; tetoPreco: number | null } {
  const f = tipo === "set" ? FILTROS_PADRAO_SET : FILTROS_PADRAO;
  return { ordenacao: f.ordenacao, tetoPreco: f.tetoPreco };
}

/** As vagas vazias da coleção, na ordem de exibição, com as cópias livres que servem em cada uma. */
async function vagasVazias(db: Database | Transacao, colecao: ColecaoDaFalta) {
  const linhas = await db
    .select({ vagaId: vaga.id, chave: vaga.chave })
    .from(vaga)
    .where(and(eq(vaga.colecaoId, colecao.id), isNull(vaga.copiaId)))
    .orderBy(asc(vaga.chave));
  const comparar = compararChavesVaga(
    colecao.tipo === "set" ? ((colecao.parametro as ParametroSet).sets ?? []) : [],
  );
  const livres = await contarCandidatosPorVagaVazia(db, colecao.id, colecao.tipo);
  return linhas
    .sort((a, b) => comparar(a.chave, b.chave))
    .map((l) => ({ ...l, livres: livres.get(l.vagaId) ?? 0 }));
}

/** A foto de exibição de cada ficha, pela mesma cadeia do resto do app. */
async function imagensDasFichas(
  db: Database | Transacao,
  pares: ReadonlyArray<{ cartaId: string; idioma: Idioma }>,
): Promise<Map<string, { imagemUrl: string | null; imagemOrigem: OrigemImagem | null }>> {
  if (pares.length === 0) return new Map();
  const querido = new Set(pares.map((p) => `${p.cartaId}:${p.idioma}`));
  const linhas = await db
    .select({
      cartaId: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      imagemUrl: imagemDaCarta(cartaCatalogo),
      imagemOrigem: origemDaImagem(cartaCatalogo),
    })
    .from(cartaCatalogo)
    .where(inArray(cartaCatalogo.id, [...new Set(pares.map((p) => p.cartaId))]));
  return new Map(
    linhas
      .filter((l) => querido.has(`${l.cartaId}:${l.idioma}`))
      .map((l) => [`${l.cartaId}:${l.idioma}`, { imagemUrl: l.imagemUrl, imagemOrigem: l.imagemOrigem }]),
  );
}

/** Quando cada opção salva foi vista pela varredura — a data do preço da Liga. */
async function datasDasOpcoes(db: Database | Transacao, ids: readonly string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const linhas = await db
    .select({ id: ligaOpcao.id, criadoEm: ligaOpcao.criadoEm })
    .from(ligaOpcao)
    .where(inArray(ligaOpcao.id, [...ids]));
  return new Map(linhas.map((l) => [l.id, l.criadoEm]));
}

/** O preço de uma escolha como a lista o somou, com o detalhe do Cardmarket quando há. */
function precoDaEscolha(
  p: PrecoDaEscolha,
  cartaId: string | null,
  precos: ReadonlyMap<string, PrecoCandidata>,
): PrecoReferencia | null {
  if (p.preco === null) return null;
  const referencia: PrecoReferencia = {
    fonte: p.fonte,
    valor: p.preco,
    em: p.em === null ? null : p.em.toISOString(),
  };
  if (p.fonte === "cardmarket") {
    const detalhe = precoDaOpcao(precos, cartaId);
    if (detalhe.preco !== null) referencia.cardmarket = detalhe.cardmarket;
  }
  return referencia;
}

function escolhasPorChave(
  escolhas: readonly EscolhaSalva[],
  precoDe: (e: EscolhaSalva) => PrecoDaEscolha,
  precos: ReadonlyMap<string, PrecoCandidata>,
): Map<string, EscolhaDaVagaFalta[]> {
  const porChave = new Map<string, EscolhaDaVagaFalta[]>();
  for (const e of escolhas) {
    if (!e.vagaVazia) continue;
    const lista = porChave.get(e.chave) ?? [];
    lista.push({
      escolhaId: e.id,
      cartaId: e.cartaId,
      nome: e.nome,
      edicaoNome: e.edicaoNome,
      numero: e.numero,
      total: e.total,
      raridade: e.raridade,
      preco: precoDaEscolha(precoDe(e), e.cartaId, precos),
    });
    porChave.set(e.chave, lista);
  }
  return porChave;
}

/** As opções de cada vaga na fonte da instalação, já na ordem do critério. */
async function opcoesPorFonte(
  db: Database | Transacao,
  colecao: ColecaoDaFalta,
  fonte: FontePreco,
  escolhas: readonly EscolhaSalva[],
  pedido: CriterioPedido,
) {
  const porChave = new Map<string, OpcoesDaVagaFalta>();

  if (fonte === "cardmarket") {
    const candidatas = await listarCandidatasDaColecao(db, colecao);
    const { vagas, cartasCandidatas, precos } = await opcoesDasCandidatasPorVaga(db, candidatas, escolhas);
    for (const v of vagas) {
      const { opcoes, descartadas } = filtrarCandidatas(v.opcoes, {
        tetoPreco: pedido.tetoPreco,
        ordenacao: pedido.ordenacao,
      });
      porChave.set(v.chave, {
        rotulo: v.rotulo,
        dex: v.dex,
        setNome: v.setNome,
        opcoes: opcoes.map((o) => opcaoDaCandidata(o, precos)),
        descartadas,
        semEstoque: v.semEstoque,
      });
    }
    const rodada = await ultimaRodadaDeCandidatas(db, colecao.id);
    const criterio: CriterioDaProposta = {
      fonte,
      ordenacao: pedido.ordenacao,
      tetoPreco: pedido.tetoPreco,
      origem: pedido.pedido ? "pedido" : "padrao",
      exigePreco: true,
    };
    return {
      porChave,
      rotulos: new Map<string, { rotulo: string | null; dex: number | null; setNome: string | null }>(),
      criterio,
      precos,
      candidatas,
      estado: {
        fonte: "cardmarket" as const,
        precosCandidatas: resumirPrecosDasCandidatas(cartasCandidatas, precos, new Date()),
        rodada:
          rodada === null
            ? null
            : {
                id: rodada.id,
                criadoEm: rodada.criadoEm.toISOString(),
                concluidaEm: rodada.concluidaEm?.toISOString() ?? null,
                erro: rodada.erro,
              },
      },
    };
  }

  // Fonte `liga`: as opções das varreduras já salvas, filtradas e ordenadas
  // pelos filtros da última (é com eles que a tela de opções as mostra).
  // Consulta nova não sai daqui, e a Liga barra o coletor desde 2026-11-11.
  const varredura: VarreduraSalva | null = await obterUltimaVarredura(db, colecao.id);
  const vagasDaLiga = varredura
    ? (await opcoesDaVarreduraPorVaga(db, colecao.id, colecao.tipo, escolhas, varredura.filtros)).vagas
    : null;
  const datas = await datasDasOpcoes(db, (vagasDaLiga ?? []).flatMap((v) => v.opcoes.map((o) => o.id)));
  for (const v of vagasDaLiga ?? []) {
    porChave.set(v.chave, {
      rotulo: v.rotulo,
      dex: v.dex,
      setNome: v.setNome ?? null,
      opcoes: v.opcoes.map((o) => opcaoDaVarredura(o, datas.get(o.id) ?? null)),
      descartadas: v.descartadas,
      semEstoque: v.semEstoque,
    });
  }
  const rotulos = new Map(
    (vagasDaLiga ? [] : await vagasParaAgrupar(db, colecao.id, colecao.tipo)).map((v) => [
      v.chave,
      { rotulo: v.rotulo, dex: v.dex, setNome: v.setNome ?? null },
    ]),
  );
  const criterio: CriterioDaProposta | null = varredura
    ? {
        fonte,
        ordenacao: varredura.filtros.ordenacao,
        tetoPreco: varredura.filtros.tetoPreco,
        origem: "varredura",
        exigePreco: true,
      }
    : null;
  return {
    porChave,
    rotulos,
    criterio,
    precos: new Map<string, PrecoCandidata>(),
    candidatas: [] as VagaComCandidatas[],
    estado: {
      fonte: "liga" as const,
      varredura: varredura
        ? {
            id: varredura.id,
            criadoEm: varredura.criadoEm.toISOString(),
            concluidaEm: varredura.concluidaEm?.toISOString() ?? null,
            erro: varredura.erro,
          }
        : null,
    },
  };
}

/**
 * Põe a foto nas opções que a leitura mostra. Na fonte Cardmarket as
 * candidatas são lidas sem foto (a cadeia da foto é uma subconsulta por
 * linha, e uma Pokédex tem milhares de fichas candidatas), e só as mostradas
 * a buscam; na Liga a opção salva já vem com ela.
 */
async function comFotos(
  db: Database | Transacao,
  opcoes: readonly OpcaoFalta[],
  candidatas: readonly VagaComCandidatas[],
): Promise<void> {
  const idiomaDaFicha = new Map(
    candidatas.flatMap((v) => v.candidatas.map((c) => [`${v.chave}|${c.cartaId}`, c.idiomaCatalogo] as const)),
  );
  const pares = opcoes.flatMap((o) => {
    if (o.alvo.tipo !== "candidata") return [];
    const idioma = idiomaDaFicha.get(`${o.alvo.chave}|${o.alvo.cartaId}`);
    return idioma ? [{ cartaId: o.alvo.cartaId, idioma }] : [];
  });
  const fotos = await imagensDasFichas(db, pares);
  for (const o of opcoes) {
    if (o.alvo.tipo !== "candidata") continue;
    const idioma = idiomaDaFicha.get(`${o.alvo.chave}|${o.alvo.cartaId}`);
    const foto = idioma ? fotos.get(`${o.alvo.cartaId}:${idioma}`) : undefined;
    if (foto?.imagemUrl) o.imagemUrl = foto.imagemUrl;
    if (foto?.imagemOrigem) o.imagemOrigem = foto.imagemOrigem;
  }
}

/**
 * Uma transação só de leitura, REPEATABLE READ: a lista para colar, as
 * opções, os preços e as escolhas veem o mesmo instante. Sem ela, uma busca
 * de preços que gravasse uma carta entre duas leituras deixaria o valor de
 * uma escolha de uma rodada e a cotação de outra.
 */
const SO_LEITURA = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

export async function lerFaltaDaColecao(
  db: Database,
  colecao: ColecaoDaFalta,
  fonte: FontePreco,
  pedido: CriterioPedido,
) {
  return db.transaction((tx) => lerFaltaNaTransacao(tx, colecao, fonte, pedido), SO_LEITURA);
}

async function lerFaltaNaTransacao(
  db: Transacao,
  colecao: ColecaoDaFalta,
  fonte: FontePreco,
  pedido: CriterioPedido,
) {
  const escolhas = await listarEscolhas(db, colecao.id);
  const { resumo, precoDe } = await resumoDaListaDeCompra(db, colecao, escolhas, fonte);
  const vazias = await vagasVazias(db, colecao);
  const porFonte = await opcoesPorFonte(db, colecao, fonte, escolhas, pedido);

  const vagas: VagaFalta[] = montarVagasDaFalta(
    vazias,
    porFonte.porChave,
    porFonte.rotulos,
    escolhasPorChave(escolhas, precoDe, porFonte.precos),
  );
  await comFotos(
    db,
    vagas.flatMap((v) => (v.proposta ? [v.proposta] : [])),
    porFonte.candidatas,
  );

  return {
    colecaoId: colecao.id,
    tipo: colecao.tipo,
    fonte,
    criterio: porFonte.criterio,
    estado: porFonte.estado,
    vagas,
    lista: resumo,
  };
}

/** As alternativas de uma vaga vazia, com foto, na ordem do critério; `null` se a vaga não é vazia. */
export async function lerAlternativasDaVaga(
  db: Database,
  colecao: ColecaoDaFalta,
  fonte: FontePreco,
  chave: string,
  pedido: CriterioPedido,
) {
  return db.transaction((tx) => lerAlternativasNaTransacao(tx, colecao, fonte, chave, pedido), SO_LEITURA);
}

async function lerAlternativasNaTransacao(
  db: Transacao,
  colecao: ColecaoDaFalta,
  fonte: FontePreco,
  chave: string,
  pedido: CriterioPedido,
) {
  const vazia = await db
    .select({ id: vaga.id })
    .from(vaga)
    .where(and(eq(vaga.colecaoId, colecao.id), eq(vaga.chave, chave), isNull(vaga.copiaId)))
    .limit(1);
  if (vazia.length === 0) return null;

  const escolhas = await listarEscolhas(db, colecao.id);
  const porFonte = await opcoesPorFonte(db, colecao, fonte, escolhas, pedido);
  const daVaga = porFonte.porChave.get(chave);
  const opcoes = [...(daVaga?.opcoes ?? [])];
  await comFotos(db, opcoes, porFonte.candidatas);
  return {
    vagaId: vazia[0].id,
    chave,
    criterio: porFonte.criterio,
    opcoes,
    descartadas: daVaga?.descartadas ?? 0,
    semEstoque: daVaga?.semEstoque ?? 0,
  };
}
