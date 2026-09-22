/**
 * Filtro e ordenação das opções de compra de uma vaga vazia — de Pokédex ou de
 * set. Módulo puro — recebe o que a busca da LigaPokemon devolveu já cruzado
 * com o nosso catálogo, e decide o que aparece e em que ordem.
 *
 * ## Os dois formatos de vaga, na mesma estrutura
 *
 * A vaga de Pokédex é uma espécie e costuma ter dezenas de opções legítimas; a
 * de set é uma carta específica e tem no máximo uma (`liga-set.ts`). O que
 * muda é só o volume: filtro, teto e ordenação valem igual nos dois, então a
 * chave da vaga aqui é a `chave` genérica (número da Pokédex ou `local_id` do
 * set), e não o `dex`.
 *
 * ## A regra 5 continua valendo
 *
 * "A seleção é sempre do usuário." Este módulo **ordena e marca**; nunca
 * escolhe. A tela mostra todas as opções que passam nos filtros e o usuário
 * seleciona as que quiser — decisão de 2026-09-02, depois de considerar a
 * alternativa de o sistema sugerir uma carta por vaga.
 *
 * ## Por que a preferência é por raridade, e não por variante
 *
 * O pedido original foi "dar preferência pra reverse foil, holo, raras e
 * depois normal". Reverse e holo **não são propriedade da carta, são da
 * oferta**: o mesmo Bulbasaur é vendido normal por um lojista e reverse por
 * outro, a preços diferentes, e a busca só devolve o menor preço da carta sem
 * dizer de qual variante ele é. Descobrir a variante custa uma requisição por
 * carta — inviável nas ~25 opções de cada uma das 161 vagas.
 *
 * Então a camada 1 (esta) ordena pelo que sabemos de graça: a **raridade**,
 * que já está no nosso catálogo. A variante entra na camada 2, quando o
 * usuário abre uma carta específica e o sistema busca as ofertas reais
 * daquela carta.
 *
 * ## A escala de raridade
 *
 * Derivada do vocabulário real do catálogo em 2026-09-02, nos dois idiomas
 * (`select raridade, count(*) from carta_catalogo group by 1`). Não é uma
 * escala de valor de mercado — é a ordem de desejo declarada pelo usuário:
 * quanto mais especial a carta, mais alto. Raridade que não casar com nenhum
 * padrão cai em `COMUM` em vez de sumir: carta sem classificação continua
 * comprável.
 */

import type { LinhaBuscaLiga } from "./liga-busca";

/** Faixas de preferência, do topo para a base. */
export enum FaixaRaridade {
  /** Carta que não existe no nosso catálogo — raridade desconhecida. */
  DESCONHECIDA = -1,
  COMUM = 0,
  INCOMUM = 1,
  RARA = 2,
  RARA_ESPECIAL = 3,
  ULTRA = 4,
  ILUSTRACAO = 5,
}

/**
 * Padrões testados em ordem: o primeiro que casar decide. A ordem importa —
 * "Ilustração Rara Especial" precisa ser testada antes de "Rara".
 */
const PADROES: ReadonlyArray<readonly [RegExp, FaixaRaridade]> = [
  [/ilustra|illustration/i, FaixaRaridade.ILUSTRACAO],
  [/hiper|hyper|secreta|secret|ace spec/i, FaixaRaridade.ILUSTRACAO],
  [/ultra|dupla|double|shiny|radiante|radiant|brilhante|brillant/i, FaixaRaridade.ULTRA],
  [/holo|vmax|vstar|\bv\b|\bex\b|\bgx\b/i, FaixaRaridade.RARA_ESPECIAL],
  [/rara|rare/i, FaixaRaridade.RARA],
  [/incomum|uncommon/i, FaixaRaridade.INCOMUM],
  [/comum|common|promo/i, FaixaRaridade.COMUM],
];

export function faixaDaRaridade(raridade: string | null | undefined): FaixaRaridade {
  if (!raridade || raridade === "None") return FaixaRaridade.COMUM;
  // "Incomum" contém "comum", e "Rara Holo" contém "Rara": só a ordem dos
  // padrões separa os dois, então nunca reordene sem rodar o teste.
  for (const [padrao, faixa] of PADROES) {
    if (padrao.test(raridade)) return faixa;
  }
  return FaixaRaridade.COMUM;
}

/** Uma opção de compra: a linha do site já cruzada com o nosso catálogo. */
export interface OpcaoCompra extends LinhaBuscaLiga {
  /**
   * Chave da vaga que esta opção preencheria — número da Pokédex ou `local_id`
   * do set, a mesma chave de `vaga.chave`.
   */
  chave: string;
  /** Número da Pokédex da vaga. Nulo em coleção de set. */
  dex: number | null;
  /**
   * Espécie buscada no site — o termo da busca, não o nome da carta. Nulo em
   * coleção de set, onde o termo é o nome da própria carta.
   */
  especie: string | null;
  /** `carta_catalogo.id` quando casou; `null` quando a carta não existe no nosso catálogo. */
  cartaId: string | null;
  /** Idioma da linha de catálogo que identificou a carta. */
  idiomaCatalogo: string | null;
  /** Raridade vinda do nosso catálogo. `null` para carta fora do catálogo. */
  raridade: string | null;
  /** Nome do set no nosso catálogo, quando casou. */
  setNome: string | null;
}

export type Ordenacao = "preferencia" | "preco";

export interface Filtros {
  /** Teto de preço por carta, em BRL. `null` = sem teto. */
  tetoPreco: number | null;
  /** Exibir cartas que não existem no nosso catálogo (chinesas, Carddass, Topsun, promos coreanos). */
  incluirForaDoCatalogo: boolean;
  /** `preferencia` = melhor carta dentro do teto; `preco` = mais barata primeiro. */
  ordenacao: Ordenacao;
  /** Teto de opções por vaga. `null` = todas. */
  limitePorVaga: number | null;
}

export const FILTROS_PADRAO: Filtros = {
  tetoPreco: 20,
  incluirForaDoCatalogo: true,
  ordenacao: "preferencia",
  limitePorVaga: null,
};

/**
 * Padrão da coleção de set — deliberadamente diferente do da Pokédex.
 *
 * **Sem teto.** Na Pokédex o teto escolhe entre dezenas de cartas da mesma
 * espécie; no set a vaga tem uma carta só, e um teto de R$ 20 apagaria as
 * caras da lista em vez de oferecer alternativa — o oposto do que a tela
 * serve. Ele continua podendo pôr um teto quando o que quiser for "o que
 * fecho por pouco".
 *
 * **Ordenação por preço**, porque "melhor carta dentro do teto" não decide
 * nada quando só existe uma opção por vaga.
 */
export const FILTROS_PADRAO_SET: Filtros = {
  tetoPreco: null,
  incluirForaDoCatalogo: true,
  ordenacao: "preco",
  limitePorVaga: null,
};

/**
 * Carta sem estoque nunca entra: preço `null` significa que nenhum lojista a
 * tem, e uma lista de compras com item que não se pode comprar é pior do que
 * uma lista curta.
 */
function compravel(opcao: OpcaoCompra, teto: number | null): boolean {
  if (opcao.preco === null) return false;
  return teto === null || opcao.preco <= teto;
}

/**
 * Ordena a lista de uma vaga. Em `preferencia`, a faixa de raridade manda e o
 * preço só desempata — é o que faz "a melhor carta que cabe no teto" ficar no
 * topo, em vez da mais barata de todas.
 *
 * Carta fora do catálogo (`DESCONHECIDA`) fica por último em `preferencia`:
 * sem raridade não há como afirmar que é melhor que uma rara conhecida, e
 * inventar uma posição para ela seria palpite. Em `preco` ela concorre de
 * igual para igual, porque aí o critério é só o número.
 */
export function ordenarOpcoes<T extends OpcaoCompra>(opcoes: T[], ordenacao: Ordenacao): T[] {
  const porPreco = (a: T, b: T) => (a.preco ?? Infinity) - (b.preco ?? Infinity);

  if (ordenacao === "preco") return [...opcoes].sort(porPreco);

  return [...opcoes].sort((a, b) => {
    const faixaA = a.cartaId ? faixaDaRaridade(a.raridade) : FaixaRaridade.DESCONHECIDA;
    const faixaB = b.cartaId ? faixaDaRaridade(b.raridade) : FaixaRaridade.DESCONHECIDA;
    if (faixaA !== faixaB) return faixaB - faixaA;
    return porPreco(a, b);
  });
}

/** A vaga vazia como o agrupamento precisa vê-la, nos dois tipos de coleção. */
export interface VagaParaAgrupar {
  /** Número da Pokédex ou `local_id` do set. */
  chave: string;
  /** O que a tela chama a vaga: a espécie (Pokédex) ou o nome da carta (set). */
  rotulo: string;
  /** Número da Pokédex, para a tela formatar "001". Nulo em coleção de set. */
  dex: number | null;
}

export interface VagaComOpcoes<T extends OpcaoCompra = OpcaoCompra>
  extends VagaParaAgrupar {
  opcoes: T[];
  /** Quantas opções foram descartadas pelos filtros — a tela precisa dizer isso. */
  descartadas: number;
}

/**
 * Agrupa as opções por vaga, aplica os filtros e ordena cada grupo.
 *
 * Vaga sem nenhuma opção continua na lista, com `opcoes` vazio. Sumir com ela
 * seria esconder a informação mais útil que existe aqui: que aquele Pokémon —
 * ou, no set, aquela carta — não tem oferta comprável dentro do teto.
 */
export function montarOpcoesPorVaga<T extends OpcaoCompra>(
  opcoes: readonly T[],
  vagas: ReadonlyArray<VagaParaAgrupar>,
  filtros: Filtros,
): VagaComOpcoes<T>[] {
  // Genérica de propósito: a rota passa a linha do banco, que carrega `id` e
  // `selecionada` além do que o domínio conhece, e precisa recuperá-los do
  // outro lado sem cast.
  const porChave = new Map<string, T[]>();
  for (const opcao of opcoes) {
    if (!filtros.incluirForaDoCatalogo && opcao.cartaId === null) continue;
    const lista = porChave.get(opcao.chave);
    if (lista) lista.push(opcao);
    else porChave.set(opcao.chave, [opcao]);
  }

  return vagas.map((vaga) => {
    const todas = porChave.get(vaga.chave) ?? [];
    const passaram = todas.filter((o) => compravel(o, filtros.tetoPreco));
    const ordenadas = ordenarOpcoes(passaram, filtros.ordenacao);
    const limitadas =
      filtros.limitePorVaga === null ? ordenadas : ordenadas.slice(0, filtros.limitePorVaga);
    return {
      ...vaga,
      opcoes: limitadas,
      descartadas: todas.length - limitadas.length,
    };
  });
}
