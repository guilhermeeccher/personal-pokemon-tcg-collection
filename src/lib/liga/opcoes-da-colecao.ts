/**
 * As opções de compra das vagas vazias de uma coleção e a lista para colar,
 * montadas do banco — o que `GET /api/colecoes/:id/opcoes-compra` e a
 * leitura do "o que falta" da v2 (`GET /api/colecoes/:id/falta`) dividem.
 *
 * Saiu da rota de opções em 2026-11-22, sem mudar a resposta dela, para que
 * as duas leituras usem a mesma montagem: a mesma lista em abas
 * (`abasDaLista`), a mesma marcação derivada da escolha e o mesmo filtro de
 * sem estoque, com a mesma exceção da carta marcada. A parte pura está em
 * `lib/dominio/opcoes-compra-vaga.ts`; aqui só se lê e se junta.
 */

import type { Database, Transacao } from "@/lib/db/client";
import { nomesDosSets } from "@/lib/db/consultas";
import type { EscolhaSalva } from "@/lib/db/escolhas";
import {
  listarOpcoesMaisRecentesPorVaga,
  listarVagasVaziasPokedex,
  listarVagasVaziasSet,
} from "@/lib/db/liga";
import { listarSemEstoqueVigente } from "@/lib/db/sem-estoque";
import { precosDasCandidatas, type PrecoCandidata, type VagaComCandidatas } from "@/lib/db/candidatas-compra";
import { lerChaveVagaSet } from "@/lib/dominio/chave-vaga-set";
import { totalDaLista } from "@/lib/dominio/exportacao-lista-compra";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import { montarOpcoesPorVaga, type Filtros, type VagaParaAgrupar } from "@/lib/dominio/liga-opcoes";
import {
  ofertarCandidatas,
  ofertarOpcoesDaVarredura,
  vagasComVariasEscolhas,
} from "@/lib/dominio/opcoes-compra-vaga";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import { abasDaLista, linhaDaEscolha, precosDasEscolhas } from "./lista-compra";

type TipoComVaga = "pokedex" | "set";

interface ColecaoDaLista {
  tipo: TipoComVaga;
  parametro: unknown;
}

/**
 * A lista para colar da coleção, com os números que a tela mostra ao lado.
 *
 * A triagem do usuário independe de varredura — é o que faz o bloco para
 * colar estar pronto quando ele abre a tela, sem rodar nada (decisão de
 * 2026-09-17).
 */
export async function resumoDaListaDeCompra(
  db: Database | Transacao,
  colecao: ColecaoDaLista,
  escolhas: readonly EscolhaSalva[],
  fonte: FontePreco,
) {
  // `vagaVazia` é o filtro que faz a lista encolher sozinha conforme o
  // usuário cadastra as cartas. A escolha de vaga já preenchida não some
  // do banco — fica guardada, e volta se a cópia sair da vaga.
  const daLista = escolhas.filter((e) => e.vagaVazia);
  // O preço é o da fonte da instalação, nunca as duas somadas
  // (`precosDasEscolhas`) — a mesma função da exportação.
  const precoDe = await precosDasEscolhas(db, daLista, fonte);
  const linhas = daLista.map((e) => linhaDaEscolha(e, precoDe(e)));

  // Coleção que junta sets: uma aba por set, com o nome dele no rótulo.
  const ordemSets = colecao.tipo === "set" ? ((colecao.parametro as ParametroSet).sets ?? []) : [];
  const nomesSets =
    colecao.tipo === "set"
      ? await nomesDosSets(
          db,
          [...new Set(linhas.flatMap((l) => lerChaveVagaSet(l.chave)?.setId ?? []))],
          (colecao.parametro as ParametroSet).idiomaCatalogo,
        )
      : new Map<string, string>();

  const precos = daLista.map((e) => precoDe(e).em).filter((d): d is Date => d !== null);
  return {
    resumo: {
      fonte,
      selecionadas: daLista.length,
      guardadas: escolhas.length - daLista.length,
      // Em abas de até 110 cartas, o limite da Compra por Lista deles — por
      // região na Pokédex. Ver `dividirListaCompra`.
      abasLiga: abasDaLista(linhas, colecao.tipo, ordemSets, nomesSets),
      // Vagas com mais de uma carta na string (`vagasComVariasEscolhas`).
      multiplas: vagasComVariasEscolhas(daLista),
      total: totalDaLista(linhas),
      // Preço sem data é armadilha: a carta que sumiu da varredura seguinte
      // continua aqui com o preço de antes, e a tela precisa poder dizer isso.
      semPreco: daLista.filter((e) => precoDe(e).preco === null).length,
      precoMaisAntigo:
        precos.length === 0
          ? null
          : new Date(Math.min(...precos.map((d) => d.getTime()))).toISOString(),
    },
    /** O preço de cada escolha na fonte ativa — o mesmo que a lista somou. */
    precoDe,
  };
}

/** As vagas vazias de hoje, no formato que o agrupamento da tela espera. */
export async function vagasParaAgrupar(
  db: Database | Transacao,
  colecaoId: string,
  tipo: TipoComVaga,
): Promise<VagaParaAgrupar[]> {
  if (tipo === "pokedex") {
    const vagas = await listarVagasVaziasPokedex(db, colecaoId);
    return vagas.map((v) => ({ chave: v.chave, rotulo: v.especie, dex: v.dex }));
  }
  const vagas = await listarVagasVaziasSet(db, colecaoId);
  return vagas.map((v) => ({ chave: v.chave, rotulo: v.nome, dex: null, setNome: v.setNome }));
}

/**
 * Fonte `liga`: vaga a vaga, as opções da varredura mais recente que achou
 * alguma coisa para ela, marcadas pela triagem, sem as sem estoque (salvo a
 * marcada) e filtradas e ordenadas pelos filtros da última varredura.
 *
 * Vaga a vaga, a consulta mais nova — não só a última rodada, que depois do
 * filtro de frescor pode ter consultado poucas vagas.
 *
 * A lista de vagas vem das vagas vazias de HOJE, não das opções gravadas.
 *
 * Derivá-la das opções fazia sumir justamente a vaga mais informativa: a que
 * não achou nenhuma carta dentro do teto. Na primeira varredura completa
 * foram 6 de 161, e a tela dizia "155 de 155" — escondendo a pergunta certa,
 * que é "quais Pokémon não têm carta comprável por esse preço?". Regra 6:
 * vaga vazia é saída de primeira classe.
 *
 * Efeito colateral desejado: vaga que o usuário preencheu depois da
 * varredura sai da lista sozinha, em vez de oferecer compra do que já é
 * dele.
 */
export async function opcoesDaVarreduraPorVaga(
  db: Database | Transacao,
  colecaoId: string,
  tipo: TipoComVaga,
  escolhas: readonly EscolhaSalva[],
  filtros: Filtros,
) {
  const opcoes = await listarOpcoesMaisRecentesPorVaga(db, colecaoId);
  const semEstoque = new Set((await listarSemEstoqueVigente(db)).map((r) => r.chave));
  const { oferecidas, escondidasPorVaga } = ofertarOpcoesDaVarredura(opcoes, escolhas, semEstoque);

  const vagasDaRodada = await vagasParaAgrupar(db, colecaoId, tipo);
  const vagas = montarOpcoesPorVaga(oferecidas, vagasDaRodada, filtros).map((v) => ({
    ...v,
    semEstoque: escondidasPorVaga.get(v.chave) ?? 0,
  }));
  return { vagas, vagasDaRodada };
}

/**
 * Fonte `cardmarket`: as candidatas do catálogo de cada vaga vazia, com o
 * valor de referência de cada uma e a marcação derivada da escolha
 * (`ofertarCandidatas`). Devolve também o conjunto de cartas candidatas e o
 * mapa de preços, que o resumo da busca de preços conta.
 */
export async function opcoesDasCandidatasPorVaga(
  db: Database | Transacao,
  vagas: readonly VagaComCandidatas[],
  escolhas: readonly EscolhaSalva[],
): Promise<{
  vagas: ReturnType<typeof ofertarCandidatas>;
  cartasCandidatas: Set<string>;
  precos: Map<string, PrecoCandidata>;
}> {
  const cartasCandidatas = new Set(vagas.flatMap((v) => v.candidatas.map((c) => c.cartaId)));
  const precos = await precosDasCandidatas(db, [
    ...cartasCandidatas,
    ...escolhas.flatMap((e) => (e.cartaId === null ? [] : [e.cartaId])),
  ]);
  const semEstoque = new Set((await listarSemEstoqueVigente(db)).map((r) => r.chave));
  return {
    vagas: ofertarCandidatas(vagas, escolhas, precos, semEstoque),
    cartasCandidatas,
    precos,
  };
}
