/**
 * Exportação da lista de compras montada na tela de opções faltantes.
 *
 * ## O formato da Compra por Lista, enfim conhecido (2026-09-16)
 *
 * A pendência aberta em 2026-09-02 fechou com a leitura da tela logada, que
 * instrui o formato.
 *
 * ```
 * Preencha no modelo [Quantidade] [Card].
 * Ex.: 2 Charizard (1/111)
 * ```
 *
 * É o que `gerarListaLiga` produz. O `exportacao-liga.ts` continua sendo outra
 * coisa — aquele é o formato de *subir a sua coleção*, aprendido em
 * 2026-08-29. Comprar e cadastrar seguem sendo fluxos diferentes.
 *
 * **Duas coisas ainda não foram verificadas contra a tela deles**, e ficam
 * declaradas como não verificadas até uma colagem real dizer:
 *
 * 1. **Zero à esquerda.** Gravamos o número como a busca **deles** devolveu
 *    (`003`), e o exemplo da tela escreve `1/111`. Mandar o número como veio é
 *    a aposta com mais chance de casar — é o texto da própria casa — mas é
 *    aposta.
 * 2. **Edição.** `(003/132)` não diz `MEG` em lugar nenhum. Se duas edições
 *    tiverem carta de mesmo número e total, o formato não tem o que desempate.
 *    Por isso a sigla continua saindo no CSV, que é o documento de conferência.
 *
 * ## Uma lista só — e por que a divisão por variante foi desfeita
 *
 * Por algumas horas em 2026-09-16 esta lista saiu **agrupada por extra** (uma
 * lista Reverse Foil, uma Foil), porque o seletor de Extras deles vale para a
 * lista inteira e era o único jeito de pedir variante diferente por carta.
 *
 * **Desfeito no mesmo dia, por decisão, e o motivo vale registrar:** a
 * Compra por Lista otimiza as lojas da lista que recebe. Duas listas viram
 * duas otimizações independentes, que podem escolher lojas diferentes — ou
 * seja, a divisão por variante trabalhava *contra* o frete, que era o objetivo
 * que originou tudo. E o processo deixava de ser fluido: duas colagens, dois
 * ajustes de seletor.
 *
 * A conclusão que fica: **a organização de lojas é deles, não nossa.** Eles
 * enxergam o marketplace inteiro e o preço real; nós enxergamos uma fatia e
 * nem preço por loja temos. O que o sistema faz bem é decidir *quais cartas
 * faltam* — e é só isso que vai para a lista.
 *
 * ## O que este módulo entrega
 *
 * 1. **CSV nosso** — todas as colunas da decisão de compra, para conferir e
 *    guardar. Continua declarado como nosso, porque é nosso.
 * 2. **Uma lista em texto no formato deles**, para uma colagem só.
 */

import type { AdapterExportacaoCsv } from "./exportacao-csv";

export interface LinhaListaCompra {
  /** Chave da vaga: número da Pokédex ou `local_id` do set. */
  chave: string;
  /** Espécie da vaga de Pokédex. Nula em coleção de set, onde a vaga é a carta. */
  especie: string | null;
  nome: string;
  edicaoNome: string;
  edicaoSigla: string;
  numero: string;
  total: string | null;
  preco: number;
  raridade: string | null;
  /** `false` quando a carta não existe no nosso catálogo — precisa de cadastro manual depois. */
  noCatalogo: boolean;
  caminho: string;
}

const SITE = "https://www.ligapokemon.com.br";

export const adapterListaCompra: AdapterExportacaoCsv<LinhaListaCompra> = {
  // "nosso" e não "liga": este CSV é documento de conferência nosso, com
  // colunas que a Compra por Lista deles não tem nem quer (raridade, link,
  // edição). O formato deles é o de `gerarListaLiga`, e só ele.
  formato: "nosso",
  cabecalho: [
    // "Vaga" e não "Dex": a mesma exportação serve Pokédex (onde a chave é o
    // número nacional) e set (onde é a numeração da carta no set).
    "Vaga",
    "Espécie",
    "Carta",
    "Edição",
    "Sigla",
    "Número",
    "Total",
    "Preço (R$)",
    "Raridade",
    "No catálogo",
    "Link",
  ],
  linha: (l) => [
    l.chave,
    l.especie ?? "",
    l.nome,
    l.edicaoNome,
    l.edicaoSigla,
    l.numero,
    l.total ?? "",
    // Decimal com vírgula, como o resto das exportações deste repo — o
    // destino é planilha em pt-BR.
    l.preco.toFixed(2).replace(".", ","),
    l.raridade ?? "",
    l.noCatalogo ? "sim" : "não",
    `${SITE}${l.caminho}`,
  ],
};

/**
 * Lista em texto **nossa**, de conferência: `1 Bulbasaur (001/165) [MEW]`.
 *
 * Difere da lista deles pela sigla da edição no fim, que a Compra por Lista
 * não prevê — e é justamente por isso que esta continua existindo: é a única
 * saída em texto que diz de que edição é cada carta. Para colar no site deles,
 * use `gerarListaLiga`.
 *
 * A quantidade é sempre 1 — uma cópia ocupa no máximo uma vaga (regra 1), e a
 * lista nasce de vagas vazias distintas. Carta repetida na seleção significa
 * vagas diferentes, então a linha aparece repetida em vez de virar `2 ...`:
 * agrupar aqui esconderia que são duas decisões dele, não uma.
 */
export function gerarListaTexto(linhas: readonly LinhaListaCompra[]): string {
  return (
    linhas
      .map((l) => {
        const numeracao = l.total ? `(${l.numero}/${l.total})` : `(${l.numero})`;
        return `1 ${l.nome} ${numeracao} [${l.edicaoSigla}]`;
      })
      .join("\n") + "\n"
  );
}

/** Soma da seleção — o número que ele quer ver antes de decidir comprar. */
export function totalDaLista(linhas: readonly LinhaListaCompra[]): number {
  return Number(linhas.reduce((soma, l) => soma + l.preco, 0).toFixed(2));
}

// --- Lista no formato da Compra por Lista ---------------------------------

/** `1 Ultra Ball (131/132)` — o modelo que a tela deles instrui. */
export function linhaFormatoLiga(l: LinhaListaCompra): string {
  const numeracao = l.total ? `(${l.numero}/${l.total})` : `(${l.numero})`;
  return `1 ${l.nome} ${numeracao}`;
}

/**
 * A lista inteira no formato da Compra por Lista, para uma colagem só.
 *
 * **Sem sigla de edição**, ao contrário de `gerarListaTexto`: o formato deles
 * não a prevê, e acrescentar campo que o parser não espera é o jeito mais
 * fácil de a linha inteira ser recusada.
 *
 * A quantidade é sempre 1 — uma cópia ocupa no máximo uma vaga (regra 1), e a
 * lista nasce de vagas vazias distintas.
 *
 * Preserva a ordem de entrada, que é a ordem da tela: sem isso ele perde a
 * correspondência entre o que marcou e o que vai colar.
 */
export function gerarListaLiga(linhas: readonly LinhaListaCompra[]): string {
  if (linhas.length === 0) return "";
  return linhas.map(linhaFormatoLiga).join("\n") + "\n";
}
