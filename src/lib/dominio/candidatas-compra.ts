/**
 * Opções de compra tiradas do **catálogo**, com o preço de referência do
 * Cardmarket — a tela de opções de compra quando `PRECO_FONTE=cardmarket`.
 * Módulo puro.
 *
 * ## Por que existe
 *
 * Em 2026-11-11 a LigaPokemon passou a barrar o coletor com um 403 do
 * firewall de borda, e a busca de opções usa a mesma rota da busca de preço
 * (`cards/search`): a tela de opções deixou de achar carta nova. Bloqueio não
 * se contorna. A saída (decisão de 2026-11-12) foi tirar da busca deles o que
 * o nosso catálogo já sabe:
 *
 * - **quais cartas servem para cada vaga vazia** — o catálogo responde sem
 *   rede;
 * - **a linha da Compra por Lista** — nome em inglês (`nome-liga.ts`) e
 *   numeração do rótulo (`numeracao-liga.ts`), conferidos contra os rótulos
 *   que as varreduras antigas trouxeram;
 * - **uma ideia de preço** — o valor do Cardmarket que a TCGdex entrega,
 *   convertido pela PTAX, o mesmo da tela de Preços. Ele é comparável ao
 *   **menor** preço da Liga (medição de 2026-11-11), que é justamente o que a
 *   varredura mostrava, e separa bem a carta barata da cara. Nas baratas o
 *   ruído é alto; o preço que vale continua sendo o da Liga, que aparece
 *   depois da colagem, com a otimização de lojas deles.
 *
 * ## A candidata
 *
 * - **Pokédex:** toda carta ativa, pt ou en, com exatamente um `dexId`, igual
 *   ao da vaga (regra 2). A forma não separa (regra 3). Japonesa fica de fora:
 *   o nome dela está em japonês, e a Compra por Lista escreve em inglês.
 * - **Set:** a carta da vaga, na ordem de idioma carta a carta da coleção.
 *
 * Uma candidata por **carta física** (`carta_id`): as fichas pt e en da mesma
 * carta são a mesma carta, com o mesmo produto no Cardmarket. A ficha de
 * exibição (foto, raridade, nome do set) segue a ordem de idiomas; o nome da
 * linha vem da ficha em inglês sempre que ela existe.
 *
 * ## A regra 5 continua valendo
 *
 * O sistema lista, ordena e filtra; quem marca é o usuário.
 */

import type { Idioma } from "./enums";
import { faixaDaRaridade, type Ordenacao } from "./liga-opcoes";
import { urlBuscaLiga } from "./liga-busca";
import { nomeNaLiga } from "./nome-liga";
import { identidadeNaLiga, numeracaoNoRotuloLiga } from "./numeracao-liga";
import type { OrigemImagem } from "./origem-imagem";

/**
 * Validade do preço de uma candidata: uma busca nova pula a carta perguntada
 * há menos que isso, achada ou não. Uma semana, e não as 24 h do inventário:
 * aqui o preço só precisa dizer "barata ou cara" na hora de escolher, e uma
 * Pokédex tem milhares de candidatas — refazer todas a cada dia seria
 * requisição à TCGdex sem ganho para a decisão.
 */
export const VALIDADE_PRECO_CANDIDATA_HORAS = 7 * 24;

/** Uma linha de `carta_catalogo` de uma candidata, no idioma dela. */
export interface FichaCandidata {
  cartaId: string;
  idioma: Idioma;
  nome: string;
  setId: string;
  setNome: string;
  setSigla: string | null;
  setQtdOficial: number | null;
  localId: string;
  raridade: string | null;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

/** Uma carta que serve para uma vaga vazia, pronta para a linha da Liga. */
export interface CartaCandidata {
  cartaId: string;
  /** O idioma da ficha de exibição — o que a escolha grava como `idiomaCatalogo`. */
  idiomaCatalogo: Idioma;
  /** Os idiomas em que a carta tem ficha: a busca de preço pergunta por eles. */
  idiomas: Idioma[];
  /** O nome como a Liga escreve: é o que vai na linha e o que a tela mostra. */
  nome: string;
  /** O nome na ficha de exibição, quando difere (Treinador em pt: `Ultra Bola`). */
  nomeExibicao: string | null;
  /** Sigla da edição na Liga; o `set_id` quando o catálogo não tem sigla. */
  edicaoSigla: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  raridade: string | null;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  /** Caminho da busca deles pelo nome, para o usuário abrir no navegador. */
  caminho: string;
}

/**
 * O caminho da busca da Liga pelo nome da carta — o link "ver ofertas", que
 * **o navegador do usuário** abre. O servidor nunca o visita: é a mesma busca
 * que barra o coletor, e para uma pessoa ela responde.
 */
export function caminhoBuscaLiga(nome: string): string {
  return `/${new URL(urlBuscaLiga(nome)).search}`;
}

/**
 * Junta as fichas de uma carta numa candidata. `ordemIdiomas` decide a ficha
 * de exibição; a ficha em inglês, quando existe, decide o nome da linha.
 * Devolve `null` sem nenhuma ficha.
 */
export function montarCandidata(
  fichas: readonly FichaCandidata[],
  ordemIdiomas: readonly Idioma[],
): CartaCandidata | null {
  const exibicao =
    ordemIdiomas.map((i) => fichas.find((f) => f.idioma === i)).find((f) => f !== undefined) ??
    fichas[0];
  if (exibicao === undefined) return null;
  const emIngles = fichas.find((f) => f.idioma === "en");
  const daLinha = emIngles ?? exibicao;

  const nome = nomeNaLiga(daLinha.nome);
  const { numero, total } = numeracaoNoRotuloLiga(daLinha);
  return {
    cartaId: exibicao.cartaId,
    idiomaCatalogo: exibicao.idioma,
    idiomas: [...new Set(fichas.map((f) => f.idioma))],
    nome,
    nomeExibicao: exibicao.nome !== daLinha.nome ? exibicao.nome : null,
    // A sigla só vai para a identidade da escolha e para o CSV de
    // conferência; a linha da Liga não leva sigla nenhuma.
    edicaoSigla: identidadeNaLiga(daLinha).sigla ?? daLinha.setId.toUpperCase(),
    edicaoNome: exibicao.setNome,
    numero,
    total,
    raridade: exibicao.raridade,
    imagemUrl: exibicao.imagemUrl,
    imagemOrigem: exibicao.imagemOrigem,
    caminho: caminhoBuscaLiga(nome),
  };
}

/** O que o filtro da tela precisa saber de uma opção. */
export interface OpcaoFiltravel {
  /** Valor de referência em reais; `null` quando não há (não buscado, ou sem preço no Cardmarket). */
  preco: number | null;
  raridade: string | null;
  selecionada: boolean;
}

export interface FiltrosCandidatas {
  /** Teto por carta, em reais. `null` = sem teto. */
  tetoPreco: number | null;
  ordenacao: Ordenacao;
}

/**
 * Aplica teto e ordenação às opções de uma vaga.
 *
 * - **O teto esconde só preço conhecido acima dele.** Carta sem preço fica:
 *   não se sabe que passa do teto, e escondê-la tiraria da tela uma carta
 *   comprável — antes da primeira busca de preço, todas.
 * - **Carta com preço vem antes da sem preço**, nas duas ordens. Em
 *   "preferência" a raridade manda e o preço desempata, como na varredura da
 *   Liga; mas uma rara sem preço no topo seria exatamente a carta cara que o
 *   usuário quer evitar escolher às cegas, e "marcar a melhor de cada vaga"
 *   pegaria ela.
 * - **A selecionada nunca some**, nem acima do teto: sem ela na grade, o
 *   usuário não teria onde desmarcar.
 *
 * `descartadas` conta o que o teto escondeu, para a tela dizer.
 */
export function filtrarCandidatas<T extends OpcaoFiltravel>(
  opcoes: readonly T[],
  filtros: FiltrosCandidatas,
): { opcoes: T[]; descartadas: number } {
  const teto = filtros.tetoPreco;
  const passaram = opcoes.filter(
    (o) => o.selecionada || o.preco === null || teto === null || o.preco <= teto,
  );

  const porPreco = (a: T, b: T) => (a.preco ?? Infinity) - (b.preco ?? Infinity);
  const porFaixa = (a: T, b: T) => faixaDaRaridade(b.raridade) - faixaDaRaridade(a.raridade);
  const semPrecoPorUltimo = (a: T, b: T) => Number(a.preco === null) - Number(b.preco === null);

  const ordenadas = [...passaram].sort((a, b) => {
    const pelaPresenca = semPrecoPorUltimo(a, b);
    if (pelaPresenca !== 0) return pelaPresenca;
    if (filtros.ordenacao === "preco") return porPreco(a, b);
    return porFaixa(a, b) || porPreco(a, b);
  });

  return { opcoes: ordenadas, descartadas: opcoes.length - ordenadas.length };
}
