/**
 * Montagem das opções de compra de cada vaga vazia, nas duas fontes — a parte
 * pura de `GET /api/colecoes/:id/opcoes-compra`. Módulo puro.
 *
 * ## Por que saiu da rota
 *
 * Até 2026-11-22 isto vivia dentro do `route.ts`. A leitura do "o que falta"
 * da v2 (`GET /api/colecoes/:id/falta`) precisa das mesmas opções, com a
 * mesma marcação e o mesmo filtro de sem estoque, e duas montagens paralelas
 * divergiriam na primeira correção. As duas rotas chamam estas funções; o
 * JSON da rota de opções não mudou com a extração (conferido com a resposta
 * de antes e de depois, nas duas fontes).
 *
 * ## O filtro de sem estoque, e a exceção da marcada
 *
 * A carta que a Liga devolveu como "sem estoque" deixa de ser oferecida
 * (decisão de 2026-09-24, `lib/dominio/sem-estoque-liga.ts`). A varredura a
 * acharia de novo, com preço de outra condição — o filtro é aqui, na
 * leitura, e não na gravação, para que o registro vencido a traga de volta
 * sem varredura nova.
 *
 * **A já selecionada fica**, com a marca: esconder uma carta que está na
 * string tiraria do usuário o único jeito de desmarcá-la pela grade.
 */

import { compararChavesVaga } from "./chave-vaga-set";
import { VALIDADE_PRECO_CANDIDATA_HORAS, type CartaCandidata } from "./candidatas-compra";
import { corteDeFrescor } from "./frescor-consulta";
import type { CriterioValorCardmarket } from "./preco-cardmarket";
import { identidadeDaCarta } from "./identidade-carta";
import { chaveSemEstoque } from "./sem-estoque-liga";

/** O que a montagem lê de uma escolha gravada (`EscolhaSalva`, em `lib/db/escolhas.ts`). */
export interface EscolhaParaOpcoes {
  id: string;
  chave: string;
  identidade: string;
  especie: string | null;
  nome: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  caminho: string;
  cartaId: string | null;
  raridade: string | null;
  /** `false` quando a vaga desta escolha já foi preenchida por uma cópia. */
  vagaVazia: boolean;
}

/**
 * Vagas com mais de uma carta na string. Várias por vaga é permitido
 * (decisão de 2026-09-17), então é aviso, não recusa: na Pokédex é quase
 * sempre sobra de triagem, e cada linha a mais é uma carta a mais comprada.
 */
export function vagasComVariasEscolhas(
  escolhas: ReadonlyArray<{ chave: string; especie: string | null; nome: string }>,
): Array<{ chave: string; rotulo: string; quantidade: number }> {
  const porVaga = new Map<string, { rotulo: string; quantidade: number }>();
  for (const e of escolhas) {
    const atual = porVaga.get(e.chave);
    if (atual) atual.quantidade++;
    else porVaga.set(e.chave, { rotulo: e.especie ?? e.nome, quantidade: 1 });
  }
  return [...porVaga]
    .filter(([, v]) => v.quantidade > 1)
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => compararChavesVaga()(a.chave, b.chave));
}

// --- Fonte `liga`: as opções das varreduras salvas --------------------------

/** O que a marcação e o filtro leem de uma opção salva da varredura. */
export interface OpcaoDaVarredura {
  chave: string;
  /** O `edid` deles. */
  edicaoId: number | null;
  edicaoSigla: string;
  nome: string;
  numero: string;
  total: string | null;
}

/**
 * Marca as opções da varredura pela triagem do usuário e esconde as sem
 * estoque (salvo a marcada — ver o cabeçalho).
 *
 * A marcação de cada opção é DERIVADA da escolha, não uma coluna dela: a
 * verdade mora em `escolha_compra`, e a linha da varredura é descartável.
 * É isso que faz a varredura nova já nascer com a triagem no lugar.
 *
 * Devolve as opções oferecidas, com `selecionada` e `semEstoque`, e quantas
 * cada vaga escondeu.
 */
export function ofertarOpcoesDaVarredura<T extends OpcaoDaVarredura>(
  opcoes: readonly T[],
  escolhas: ReadonlyArray<Pick<EscolhaParaOpcoes, "chave" | "identidade">>,
  semEstoque: ReadonlySet<string>,
): {
  oferecidas: Array<T & { selecionada: boolean; semEstoque: boolean }>;
  escondidasPorVaga: Map<string, number>;
} {
  const escolhidas = new Set(escolhas.map((e) => `${e.chave}|${e.identidade}`));
  const opcoesComMarcacao = opcoes.map((o) => ({
    ...o,
    // `edicaoId` é o `edid` deles — o nome muda entre a linha da busca e a
    // coluna do banco, e a identidade precisa do valor, não do rótulo.
    selecionada: escolhidas.has(
      `${o.chave}|${identidadeDaCarta({
        edid: o.edicaoId,
        edicaoSigla: o.edicaoSigla,
        numero: o.numero,
      })}`,
    ),
  }));

  const escondidasPorVaga = new Map<string, number>();
  const oferecidas = opcoesComMarcacao
    .map((o) => ({ ...o, semEstoque: semEstoque.has(chaveSemEstoque(o)) }))
    .filter((o) => {
      if (!o.semEstoque || o.selecionada) return true;
      escondidasPorVaga.set(o.chave, (escondidasPorVaga.get(o.chave) ?? 0) + 1);
      return false;
    });
  return { oferecidas, escondidasPorVaga };
}

// --- Fonte `cardmarket`: as candidatas do catálogo --------------------------

/** O que a montagem lê do preço de uma candidata (`PrecoCandidata`, em `lib/db/candidatas-compra.ts`). */
export interface PrecoParaOpcoes {
  valor: number | null;
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  tendenciaEur: number | null;
  cotacao: number | null;
  cotacaoData: string | null;
  consultadoEm: Date;
}

/** Uma vaga vazia e as candidatas dela (`VagaComCandidatas`, em `lib/db/candidatas-compra.ts`). */
export interface VagaComCandidatasParaOpcoes {
  chave: string;
  rotulo: string;
  setNome: string | null;
  dex: number | null;
  candidatas: readonly CartaCandidata[];
}

/** O preço de uma opção como a tela de opções o recebe. */
export type PrecoDaOpcao =
  | { preco: null; consultadaEm?: string }
  | {
      preco: number;
      cardmarket: {
        valorEur: number | null;
        criterioValor: CriterioValorCardmarket | null;
        tendenciaEur?: number | null;
        cotacao: number | null;
        cotacaoData: string | null;
      };
    };

/**
 * Enxuto de propósito: uma Pokédex manda milhares de candidatas, e a tela
 * relê tudo a cada 10 s enquanto a busca anda. Vai só o que ela lê — a
 * data da pergunta só quando não há preço (para dizer "o Cardmarket não
 * tem"), a tendência só quando ela foi trocada pela média de 30 dias.
 */
export function precoDaOpcao(
  precos: ReadonlyMap<string, PrecoParaOpcoes>,
  cartaId: string | null,
): PrecoDaOpcao {
  const p = cartaId === null ? undefined : precos.get(cartaId);
  if (p === undefined) return { preco: null };
  if (p.valor === null) return { preco: null, consultadaEm: p.consultadoEm.toISOString() };
  return {
    preco: p.valor,
    cardmarket: {
      valorEur: p.valorEur,
      criterioValor: p.criterioValor,
      ...(p.criterioValor === "media30" ? { tendenciaEur: p.tendenciaEur } : {}),
      cotacao: p.cotacao,
      cotacaoData: p.cotacaoData,
    },
  };
}

/** Uma opção de vaga na fonte Cardmarket: uma candidata do catálogo, ou uma escolha avulsa. */
export type OpcaoCandidata = {
  id: string;
  /** Só na escolha avulsa: o id dela, que é como ela se desmarca. */
  escolhaId?: string;
  chave: string;
  nome: string;
  nomeExibicao?: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  raridade: string | null;
  cartaId: string | null;
  /** Só na escolha avulsa; a candidata o monta do nome (`caminhoBuscaLiga`). */
  caminho?: string;
  selecionada: boolean;
  semEstoque: boolean;
  imagemUrl: string | null;
  imagemOrigem: CartaCandidata["imagemOrigem"];
} & PrecoDaOpcao;

export interface VagaComOpcoesCandidatas {
  chave: string;
  rotulo: string;
  setNome: string | null;
  dex: number | null;
  opcoes: OpcaoCandidata[];
  descartadas: number;
  semEstoque: number;
}

/**
 * As candidatas de cada vaga vazia, com o valor de referência de cada uma,
 * sem filtro de teto (a tela filtra, `filtrarCandidatas`).
 *
 * A marcação é derivada da escolha pela carta (`carta_id`), como na
 * varredura ela era derivada pela identidade da Liga. A escolha que nenhuma
 * candidata explica — de uma varredura antiga, fora do catálogo — entra na
 * grade da vaga dela, marcada: é o único lugar em que dá para desmarcá-la.
 *
 * Mesma regra da varredura: a carta que a Liga devolveu como sem estoque
 * some da grade, salvo se estiver marcada.
 */
export function ofertarCandidatas(
  vagas: readonly VagaComCandidatasParaOpcoes[],
  escolhas: readonly EscolhaParaOpcoes[],
  precos: ReadonlyMap<string, PrecoParaOpcoes>,
  semEstoque: ReadonlySet<string>,
): VagaComOpcoesCandidatas[] {
  const escolhasPorVaga = new Map<string, EscolhaParaOpcoes[]>();
  for (const e of escolhas) {
    if (!e.vagaVazia) continue;
    const lista = escolhasPorVaga.get(e.chave);
    if (lista) lista.push(e);
    else escolhasPorVaga.set(e.chave, [e]);
  }

  return vagas.map((v) => {
    const daVaga = escolhasPorVaga.get(v.chave) ?? [];
    const explicadas = new Set<string>();
    const candidatas: OpcaoCandidata[] = v.candidatas.map((c) => {
      const marcadas = daVaga.filter((e) => e.cartaId === c.cartaId);
      for (const e of marcadas) explicadas.add(e.id);
      // Sem `caminho`: a tela o monta do nome (`caminhoBuscaLiga`).
      return {
        id: `${v.chave}|${c.cartaId}`,
        chave: v.chave,
        nome: c.nome,
        ...(c.nomeExibicao === null ? {} : { nomeExibicao: c.nomeExibicao }),
        edicaoNome: c.edicaoNome,
        numero: c.numero,
        total: c.total,
        raridade: c.raridade,
        cartaId: c.cartaId,
        selecionada: marcadas.length > 0,
        semEstoque: semEstoque.has(chaveSemEstoque(c)),
        imagemUrl: c.imagemUrl,
        imagemOrigem: c.imagemOrigem,
        ...precoDaOpcao(precos, c.cartaId),
      };
    });
    const avulsas: OpcaoCandidata[] = daVaga
      .filter((e) => !explicadas.has(e.id))
      .map((e) => ({
        id: `escolha|${e.id}`,
        escolhaId: e.id,
        chave: v.chave,
        nome: e.nome,
        edicaoNome: e.edicaoNome,
        numero: e.numero,
        total: e.total,
        raridade: e.raridade,
        cartaId: e.cartaId,
        caminho: e.caminho,
        selecionada: true,
        semEstoque: semEstoque.has(chaveSemEstoque(e)),
        imagemUrl: null,
        imagemOrigem: null,
        ...precoDaOpcao(precos, e.cartaId),
      }));

    let escondidas = 0;
    const oferecidas = [...avulsas, ...candidatas].filter((o) => {
      if (!o.semEstoque || o.selecionada) return true;
      escondidas++;
      return false;
    });
    return {
      chave: v.chave,
      rotulo: v.rotulo,
      setNome: v.setNome,
      dex: v.dex,
      opcoes: oferecidas,
      descartadas: 0,
      semEstoque: escondidas,
    };
  });
}

/**
 * Quanto do preço das candidatas já existe — o que a tela diz ao lado do
 * botão de buscar preços. "A buscar" é exatamente o que uma rodada disparada
 * agora perguntaria: sem resposta, ou com a última pergunta mais velha que a
 * validade (`VALIDADE_PRECO_CANDIDATA_HORAS`), achada ou não.
 */
export function resumirPrecosDasCandidatas(
  cartasCandidatas: ReadonlySet<string>,
  precos: ReadonlyMap<string, Pick<PrecoParaOpcoes, "valor" | "consultadoEm">>,
  agora: Date,
): { cartas: number; comPreco: number; semPrecoNoCardmarket: number; aBuscar: number; validadeDias: number } {
  const corte = corteDeFrescor({ agora, validadeHoras: VALIDADE_PRECO_CANDIDATA_HORAS });
  let comPreco = 0;
  let semPrecoNoCardmarket = 0;
  let aBuscar = 0;
  for (const cartaId of cartasCandidatas) {
    const p = precos.get(cartaId);
    if (p?.valor != null) comPreco++;
    else if (p !== undefined) semPrecoNoCardmarket++;
    if (p === undefined || p.consultadoEm.getTime() <= corte.getTime()) aBuscar++;
  }
  return {
    cartas: cartasCandidatas.size,
    comPreco,
    semPrecoNoCardmarket,
    aBuscar,
    validadeDias: Math.round(VALIDADE_PRECO_CANDIDATA_HORAS / 24),
  };
}
