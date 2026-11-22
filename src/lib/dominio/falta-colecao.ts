/**
 * O "o que falta" de uma coleção, enxuto — a leitura da v2
 * (`GET /api/colecoes/:id/falta`) que a aba de mesmo nome usa para marcar
 * compra direto da grade. Módulo puro.
 *
 * ## O que cada vaga vazia traz
 *
 * - **A proposta do atalho e o critério.** "Marcar a melhor de cada vaga" é a
 *   primeira opção da vaga na ordem do critério (teto e ordenação), e só para
 *   a vaga sem escolha nenhuma — o cálculo da tela de opções da v1, com uma
 *   trava a mais (`propostaDaVaga`). Na fonte Cardmarket, **só se ela tiver preço**: marcar
 *   carta sem preço seria escolher às cegas, que é o que o preço existe para
 *   evitar; `filtrarCandidatas` já põe as sem preço por último, então se a
 *   primeira não tem, nenhuma tem. Continua sendo clique do usuário (regra 5):
 *   isto diz qual carta o atalho marcaria, e por quê; não marca nada.
 * - **O preço com fonte e data** (e a cotação, no Cardmarket). As fontes
 *   nunca se misturam: a leitura usa a da instalação.
 * - **As escolhas atuais, identificáveis**: o id de cada uma é o que a
 *   desmarca. Várias por vaga continuam permitidas (decisão de 2026-09-17).
 * - **Quantas alternativas há**, e quantas o teto e o "sem estoque"
 *   esconderam. As alternativas em si vêm sob demanda
 *   (`GET /api/colecoes/:id/falta/alternativas`): numa Pokédex são milhares
 *   de cartas com foto.
 *
 * ## Sem preço ainda, e a fonte Liga sem varredura
 *
 * Antes da primeira busca de preços nenhuma candidata tem preço: a vaga vem
 * sem proposta (`semProposta: "semPreco"`) mas com as alternativas contadas,
 * e o usuário marca à mão. Na fonte Liga as opções são as das varreduras já
 * salvas (a Liga barra consultas novas desde 2026-11-11; nada aqui as
 * contorna); sem varredura, a vaga vem sem opção, e as escolhas já feitas
 * continuam desmarcáveis.
 *
 * ## Regra 6
 *
 * Toda vaga vazia vem, inclusive a que nenhuma opção cobre — "nenhuma carta
 * comprável" é a informação, não um buraco na lista.
 */

import { rotuloChaveVaga } from "./chave-vaga-set";
import type { FontePreco } from "./fonte-preco";
import type { Ordenacao } from "./liga-opcoes";
import type { OpcaoCandidata } from "./opcoes-compra-vaga";
import type { OrigemImagem } from "./origem-imagem";
import type { CriterioValorCardmarket } from "./preco-cardmarket";

/** Um preço de referência, sempre com a fonte e quando foi lido. */
export interface PrecoReferencia {
  fonte: FontePreco;
  /**
   * Em reais. Cardmarket: o valor guardado, convertido pela PTAX do dia da
   * consulta. Liga, sem conversão: numa opção de compra, o menor preço com
   * estoque que a varredura viu; numa carta possuída, ver `liga`.
   */
  valor: number;
  /** Quando o preço foi lido; nulo quando a fonte não guardou a data. */
  em: string | null;
  /** Só na fonte Cardmarket: o valor em euro, de onde ele veio e a cotação que o converteu. */
  cardmarket?: {
    valorEur: number | null;
    criterioValor: CriterioValorCardmarket | null;
    /** Só quando a tendência foi trocada pela média de 30 dias. */
    tendenciaEur?: number | null;
    cotacao: number | null;
    /** YYYY-MM-DD, o boletim da PTAX. */
    cotacaoData: string | null;
  };
  /**
   * Só no preço de carta possuída na fonte Liga (detalhe da carta): os três
   * números da busca. Lá o `valor` é o médio, senão o menor — a mesma régua
   * das joias e da tela de Preços (`valorDaCarta`).
   */
  liga?: { minimo: number | null; medio: number | null; maximo: number | null };
}

/**
 * Como marcar ou desmarcar uma opção pelo `PATCH .../opcoes-compra/selecao`:
 *
 * - `candidata` (Cardmarket): `{ cartas: [{ chave, cartaId }], selecionada }`;
 * - `opcaoLiga` (Liga): `{ ids: [id], selecionada }`;
 * - `escolha`: só desmarca, `{ ids: [escolhaId], selecionada: false }` — a
 *   escolha que nenhuma candidata explica, de uma varredura antiga.
 */
export type AlvoDaOpcao =
  | { tipo: "candidata"; chave: string; cartaId: string }
  | { tipo: "opcaoLiga"; id: string }
  | { tipo: "escolha"; escolhaId: string };

/** Uma opção de compra de uma vaga, no formato da v2 — igual nas duas fontes. */
export interface OpcaoFalta {
  /** O mesmo id da tela de opções. */
  id: string;
  alvo: AlvoDaOpcao;
  cartaId: string | null;
  /** O nome como a Liga escreve (o da linha para colar). */
  nome: string;
  /** O nome na ficha de exibição, quando difere. */
  nomeExibicao?: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  raridade: string | null;
  /** Só onde a leitura traz foto (a proposta e as alternativas); a URL crua. */
  imagemUrl?: string;
  imagemOrigem?: OrigemImagem;
  selecionada: boolean;
  /** A Liga disse "sem estoque"; só aparece marcada (a não marcada é escondida). */
  semEstoque: boolean;
  preco: PrecoReferencia | null;
  /** Cardmarket: a carta foi perguntada e não havia preço — quando. */
  consultadaSemPrecoEm?: string;
}

/** O que a montagem lê de uma opção salva da Liga, já marcada e filtrada. */
export interface OpcaoLigaParaFalta {
  id: string;
  nome: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  raridade: string | null;
  cartaId: string | null;
  preco: number;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  selecionada: boolean;
  semEstoque: boolean;
}

/** Converte uma opção da fonte Cardmarket (`ofertarCandidatas`). */
export function opcaoDaCandidata(
  o: OpcaoCandidata,
  precos: ReadonlyMap<string, { precoEm: Date | null }>,
): OpcaoFalta {
  let alvo: AlvoDaOpcao;
  if (o.escolhaId !== undefined) alvo = { tipo: "escolha", escolhaId: o.escolhaId };
  else if (o.cartaId !== null) alvo = { tipo: "candidata", chave: o.chave, cartaId: o.cartaId };
  // A candidata sempre vem do catálogo, com `carta_id`; só a avulsa pode não ter.
  else throw new Error(`falta: a opção ${o.id} não é candidata nem escolha`);
  const opcao: OpcaoFalta = {
    id: o.id,
    alvo,
    cartaId: o.cartaId,
    nome: o.nome,
    edicaoNome: o.edicaoNome,
    numero: o.numero,
    total: o.total,
    raridade: o.raridade,
    selecionada: o.selecionada,
    semEstoque: o.semEstoque,
    preco: null,
  };
  if (o.nomeExibicao !== undefined) opcao.nomeExibicao = o.nomeExibicao;
  if (o.imagemUrl !== null) opcao.imagemUrl = o.imagemUrl;
  if (o.imagemOrigem !== null) opcao.imagemOrigem = o.imagemOrigem;
  if (o.preco !== null) {
    const em = o.cartaId === null ? null : (precos.get(o.cartaId)?.precoEm ?? null);
    opcao.preco = {
      fonte: "cardmarket",
      valor: o.preco,
      em: em === null ? null : em.toISOString(),
      cardmarket: o.cardmarket,
    };
  } else if (o.consultadaEm !== undefined) {
    opcao.consultadaSemPrecoEm = o.consultadaEm;
  }
  return opcao;
}

/** Converte uma opção da fonte Liga (varredura salva); `em` é quando a varredura a viu. */
export function opcaoDaVarredura(o: OpcaoLigaParaFalta, em: Date | null): OpcaoFalta {
  const opcao: OpcaoFalta = {
    id: o.id,
    alvo: { tipo: "opcaoLiga", id: o.id },
    cartaId: o.cartaId,
    nome: o.nome,
    edicaoNome: o.edicaoNome,
    numero: o.numero,
    total: o.total,
    raridade: o.raridade,
    selecionada: o.selecionada,
    semEstoque: o.semEstoque,
    preco: { fonte: "liga", valor: o.preco, em: em === null ? null : em.toISOString() },
  };
  if (o.imagemUrl !== null) opcao.imagemUrl = o.imagemUrl;
  if (o.imagemOrigem !== null) opcao.imagemOrigem = o.imagemOrigem;
  return opcao;
}

export type MotivoSemProposta = "semOpcao" | "jaTemEscolha" | "semPreco";

/**
 * A opção que "marcar a melhor de cada vaga" marcaria nesta vaga, ou o motivo
 * de não haver. `opcoes` já vem na ordem do critério, sem as escondidas;
 * `escolhasDaVaga` é quantas escolhas a vaga tem hoje.
 *
 * **Vaga com qualquer escolha não recebe proposta**, mesmo que nenhuma opção
 * apareça marcada. A v1 olhava só as opções marcadas, e na fonte Liga uma
 * escolha feita pelo catálogo (identidade pela sigla) não casa com a opção da
 * varredura (identidade pelo `edid`): o atalho marcaria uma segunda carta
 * numa vaga que já tinha a sua. Na fonte Cardmarket as duas regras dão o
 * mesmo resultado, porque toda escolha de vaga vazia aparece como opção
 * marcada (`ofertarCandidatas`). Decisão de 2026-11-22.
 */
export function propostaDaVaga(
  opcoes: readonly OpcaoFalta[],
  escolhasDaVaga = 0,
): { proposta: OpcaoFalta } | { semProposta: MotivoSemProposta } {
  if (opcoes.length === 0) return { semProposta: "semOpcao" };
  if (escolhasDaVaga > 0 || opcoes.some((o) => o.selecionada)) return { semProposta: "jaTemEscolha" };
  const primeira = opcoes[0];
  // A escolha avulsa é sempre marcada, então não chega aqui; a Liga sempre
  // tem preço (a varredura só grava o que tem estoque). Sobra o Cardmarket
  // antes da busca de preços, ou a carta que ele não tem.
  if (primeira.preco === null || primeira.alvo.tipo === "escolha") return { semProposta: "semPreco" };
  return { proposta: primeira };
}

/** O critério que ordenou as opções e decide a proposta. */
export interface CriterioDaProposta {
  fonte: FontePreco;
  ordenacao: Ordenacao;
  /** Em reais; nulo sem teto. O teto esconde só preço conhecido acima dele. */
  tetoPreco: number | null;
  /**
   * `padrao`: o da tela de opções para o tipo de coleção; `pedido`: o que a
   * tela mandou na URL; `varredura`: o da última varredura da Liga, que é
   * com o que as opções salvas foram filtradas.
   */
  origem: "padrao" | "pedido" | "varredura";
  /** O atalho só propõe opção com preço (sempre verdade nas duas fontes hoje). */
  exigePreco: true;
}

/** Uma escolha atual da vaga, com o preço na fonte da instalação. */
export interface EscolhaDaVagaFalta {
  /** O que desmarca: `{ ids: [escolhaId], selecionada: false }`. */
  escolhaId: string;
  cartaId: string | null;
  nome: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  raridade: string | null;
  preco: PrecoReferencia | null;
}

export interface VagaFalta {
  vagaId: string;
  chave: string;
  /** O número que a tela escreve (`rotuloChaveVaga`). */
  numero: string;
  /** A espécie (Pokédex) ou o nome da carta (set); nulo quando o catálogo não a conhece. */
  rotulo: string | null;
  dex: number | null;
  setNome: string | null;
  /** Cópias livres que já cabem na vaga: "dá para alocar agora". */
  livres: number;
  /** Opções oferecidas (depois do teto e do sem estoque) — o tamanho das alternativas. */
  opcoes: number;
  /** Escondidas pelo teto. */
  descartadas: number;
  /** Escondidas por estarem sem estoque na Liga (a marcada nunca é escondida). */
  semEstoque: number;
  proposta: OpcaoFalta | null;
  semProposta?: MotivoSemProposta;
  escolhas: EscolhaDaVagaFalta[];
}

/** Uma vaga vazia, como a leitura a conhece antes das opções. */
export interface VagaVaziaParaFalta {
  vagaId: string;
  chave: string;
  livres: number;
}

/** As opções de uma vaga, já na ordem do critério. */
export interface OpcoesDaVagaFalta {
  rotulo: string | null;
  dex: number | null;
  setNome: string | null;
  opcoes: readonly OpcaoFalta[];
  descartadas: number;
  semEstoque: number;
}

/**
 * Monta as vagas do "o que falta" na ordem de `vazias` (a de exibição). A
 * vaga sem entrada em `opcoesPorChave` — espécie ou carta que o catálogo não
 * conhece, ou a fonte Liga sem varredura — vem com zero opção e sem proposta.
 */
export function montarVagasDaFalta(
  vazias: readonly VagaVaziaParaFalta[],
  opcoesPorChave: ReadonlyMap<string, OpcoesDaVagaFalta>,
  rotulos: ReadonlyMap<string, { rotulo: string | null; dex: number | null; setNome: string | null }>,
  escolhasPorChave: ReadonlyMap<string, readonly EscolhaDaVagaFalta[]>,
): VagaFalta[] {
  return vazias.map((v) => {
    const o = opcoesPorChave.get(v.chave);
    const r = o ?? rotulos.get(v.chave);
    const opcoes = o?.opcoes ?? [];
    const escolhas = escolhasPorChave.get(v.chave) ?? [];
    const decisao = propostaDaVaga(opcoes, escolhas.length);
    return {
      vagaId: v.vagaId,
      chave: v.chave,
      numero: rotuloChaveVaga(v.chave),
      rotulo: r?.rotulo ?? null,
      dex: r?.dex ?? null,
      setNome: r?.setNome ?? null,
      livres: v.livres,
      opcoes: opcoes.length,
      descartadas: o?.descartadas ?? 0,
      semEstoque: o?.semEstoque ?? 0,
      proposta: "proposta" in decisao ? decisao.proposta : null,
      ...("semProposta" in decisao ? { semProposta: decisao.semProposta } : {}),
      escolhas: [...escolhas],
    };
  });
}

/** O critério pedido na URL: `ordenacao` e `teto`, com o padrão da tela de opções. */
export function lerCriterioDaUrl(
  params: URLSearchParams,
  padrao: { ordenacao: Ordenacao; tetoPreco: number | null },
  ordenacaoFixa: Ordenacao | null,
): { ok: true; ordenacao: Ordenacao; tetoPreco: number | null; pedido: boolean } | { ok: false } {
  const ordenacaoBruta = params.get("ordenacao");
  const tetoBruto = params.get("teto");
  if (ordenacaoBruta !== null && ordenacaoBruta !== "preferencia" && ordenacaoBruta !== "preco") {
    return { ok: false };
  }
  let tetoPreco = padrao.tetoPreco;
  if (tetoBruto !== null) {
    if (tetoBruto === "") {
      tetoPreco = null;
    } else {
      const n = Number(tetoBruto);
      if (!Number.isFinite(n) || n <= 0) return { ok: false };
      tetoPreco = n;
    }
  }
  // Coleção de set ordena sempre por preço, como a tela de opções: uma vaga
  // tem uma carta só, e "melhor dentro do teto" não decide nada.
  const ordenacao = ordenacaoFixa ?? (ordenacaoBruta as Ordenacao | null) ?? padrao.ordenacao;
  return { ok: true, ordenacao, tetoPreco, pedido: ordenacaoBruta !== null || tetoBruto !== null };
}
