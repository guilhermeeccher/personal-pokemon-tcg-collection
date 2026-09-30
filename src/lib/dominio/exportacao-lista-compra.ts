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
 * 2. **A lista em texto no formato deles, dividida em abas de até 110
 *    cartas** — o limite da Compra por Lista (ver `dividirListaCompra`).
 */

import type { AdapterExportacaoCsv } from "./exportacao-csv";
import {
  POKEDEX_NACIONAL_FIM,
  POKEDEX_NACIONAL_INICIO,
  REGIOES,
  regiaoDoNumero,
  type Regiao,
} from "./escopo-pokedex";
import { compararChavesVaga, lerChaveVagaSet } from "./chave-vaga-set";

export interface LinhaListaCompra {
  /** Chave da vaga: número da Pokédex ou `set/local_id` (`chave-vaga-set.ts`). */
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
 * agrupar aqui esconderia que são duas decisões do usuário, não uma.
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

/**
 * Soma da seleção — o número que o usuário quer ver antes de decidir comprar.
 */
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
 * Linhas no formato da Compra por Lista — o texto de uma aba (ou da lista
 * inteira, na exportação sem aba).
 *
 * **Sem sigla de edição**, ao contrário de `gerarListaTexto`: o formato deles
 * não a prevê, e acrescentar campo que o parser não espera é o jeito mais
 * fácil de a linha inteira ser recusada.
 *
 * A quantidade é sempre 1 — uma cópia ocupa no máximo uma vaga (regra 1), e a
 * lista nasce de vagas vazias distintas.
 *
 * Preserva a ordem de entrada, que é a ordem da tela: sem isso o usuário
 * perde a correspondência entre o que marcou e o que vai colar.
 */
export function gerarListaLiga(linhas: readonly LinhaListaCompra[]): string {
  if (linhas.length === 0) return "";
  return linhas.map(linhaFormatoLiga).join("\n") + "\n";
}

// --- Abas: o limite de 110 cartas da Compra por Lista -----------------------

/**
 * Quantas cartas a Compra por Lista deles aceita numa busca só. Observado na
 * tela logada em 2026-09-24; acima disso a colagem não passa inteira.
 *
 * Toda linha nossa tem quantidade 1 (ver `gerarListaTexto`), então linhas e
 * cartas são o mesmo número.
 */
export const LIMITE_COMPRA_POR_LISTA = 110;

export interface AbaListaCompra {
  /** Identificador estável na URL de download: `kanto-1`, `lista-2`. */
  id: string;
  /**
   * Região da aba, na Pokédex. Nula em coleção de set, e também na Pokédex
   * para a vaga cuja chave não é um número da Nacional — não deveria existir,
   * mas sumir com ela da lista seria pior que agrupá-la à parte.
   */
  regiao: Regiao | null;
  /**
   * Set da aba, numa coleção que junta sets. Nulo na Pokédex e na coleção
   * de um set só, que continua com a aba simples.
   */
  setId: string | null;
  /** 1-based. Com `partes` > 1, a tela escreve `Kanto (1/2)`. */
  parte: number;
  partes: number;
  linhas: LinhaListaCompra[];
}

function regiaoDaChave(chave: string): Regiao | null {
  const n = Number(chave);
  if (!Number.isInteger(n) || n < POKEDEX_NACIONAL_INICIO || n > POKEDEX_NACIONAL_FIM) {
    return null;
  }
  return regiaoDoNumero(n);
}

function fatiar(
  linhas: readonly LinhaListaCompra[],
  grupo: { regiao: Regiao | null; setId: string | null },
  limite: number,
): AbaListaCompra[] {
  const partes = Math.ceil(linhas.length / limite);
  const prefixo = grupo.regiao ?? (grupo.setId !== null ? `set-${grupo.setId}` : "lista");
  return Array.from({ length: partes }, (_, i) => ({
    id: `${prefixo}-${i + 1}`,
    regiao: grupo.regiao,
    setId: grupo.setId,
    parte: i + 1,
    partes,
    linhas: linhas.slice(i * limite, (i + 1) * limite),
  }));
}

/**
 * Divide a lista de compras em abas que cabem numa colagem.
 *
 * ## Por que existe, e o que ela desfaz da decisão de 2026-09-16
 *
 * A lista era única de propósito: cada lista vira uma otimização de lojas
 * independente na Liga, e dividir piora o frete (ver o cabeçalho deste
 * arquivo). O limite de 110 cartas deles tornou a divisão obrigatória — uma
 * Pokédex com 135 escolhas não cabe numa colagem.
 *
 * - **Pokédex: uma aba por região**, na ordem da Nacional. Decisão de
 *   2026-09-24, consciente do custo: divide também quando caberia junto (40 de
 *   Kanto e 30 de Johto viram duas colagens), em troca de listas que
 *   correspondem ao fichário. Região acima do limite vira `Kanto (1/2)`,
 *   `Kanto (2/2)`.
 * - **Set: uma aba só enquanto couber**, depois `Lista (1/2)`...
 * - **Coleção que junta sets: uma aba por set** (2026-09-30), na ordem da
 *   receita, pelo mesmo motivo da região — a lista corresponde ao fichário
 *   de cada set, ao custo de uma colagem a mais. Carta avulsa de um set fora
 *   da receita ganha a aba do set dela, depois das da receita.
 *
 * A aba **enche até o limite** e o resto vai para a próxima (130 = 110 + 20),
 * em vez de equilibrar: é o que minimiza o número de colagens.
 *
 * A ordem dentro de cada aba é a da vaga (número natural, `1, 2, 10`). A
 * chave é texto no banco e a ordem lexicográfica dela (`1, 10, 100, 2`) não
 * serve para ninguém conferir a colagem contra o fichário. Várias escolhas da
 * mesma vaga mantêm a ordem de entrada (o `sort` é estável).
 */
export function dividirListaCompra(
  linhas: readonly LinhaListaCompra[],
  tipo: "pokedex" | "set",
  limite: number = LIMITE_COMPRA_POR_LISTA,
  ordemSets: readonly string[] = [],
): AbaListaCompra[] {
  const comparar = compararChavesVaga(ordemSets);
  const ordenadas = [...linhas].sort((a, b) => comparar(a.chave, b.chave));

  if (tipo === "set") {
    // A ordenação já agrupa por set; cada troca de set abre um grupo.
    const porSet: { setId: string | null; linhas: LinhaListaCompra[] }[] = [];
    for (const l of ordenadas) {
      const setId = lerChaveVagaSet(l.chave)?.setId ?? null;
      const ultimo = porSet.at(-1);
      if (ultimo && ultimo.setId === setId) ultimo.linhas.push(l);
      else porSet.push({ setId, linhas: [l] });
    }
    if (porSet.length <= 1) return fatiar(ordenadas, { regiao: null, setId: null }, limite);
    return porSet.flatMap((g) => fatiar(g.linhas, { regiao: null, setId: g.setId }, limite));
  }

  const porRegiao = new Map<Regiao | null, LinhaListaCompra[]>();
  for (const l of ordenadas) {
    const regiao = regiaoDaChave(l.chave);
    const grupo = porRegiao.get(regiao);
    if (grupo) grupo.push(l);
    else porRegiao.set(regiao, [l]);
  }

  // Ordem da Nacional, e o grupo sem região por último.
  return [...REGIOES, null].flatMap((regiao) => {
    const grupo = porRegiao.get(regiao);
    return grupo ? fatiar(grupo, { regiao, setId: null }, limite) : [];
  });
}
