/**
 * Leitura da busca de cartas da **LigaPokemon** — montagem da URL e parse do
 * HTML de resultado. Módulo puro: não faz requisição, não toca banco. Quem
 * bate no site é `lib/liga/cliente.ts`.
 *
 * ## Por que a LigaPokemon, e por que raspando
 *
 * A Fase 6 da spec esperava "fonte confiável de preço BR". Não existe API
 * pública: nem a LigaPokemon nem o mypcards publicam uma, e o ator do Apify
 * cobra US$ 4 por carta consultada. O que existe é a busca do site, que
 * responde HTML a cliente comum — o mypcards, por comparação, está atrás do
 * challenge do Cloudflare e não responde a ninguém que não seja navegador.
 *
 * Decidido em 2026-09-02.
 *
 * ## A combinação de parâmetros que faz a busca servir
 *
 * `searchprod=0` + `orderBy=7`, medido ao vivo antes de existir este arquivo:
 *
 * - **`searchprod=0` tira produto selado** da busca. Sem ele, figura, lata e
 *   deck pronto disputam as 40 vagas da página com as cartas.
 * - **`orderBy=7` ordena por menor preço crescente.** As primeiras linhas são
 *   as cartas **sem estoque** (preço R$ 0,00), e logo depois vêm as mais
 *   baratas de verdade. Numa página de Bulbasaur: 15 sem estoque, depois 25
 *   com estoque a partir de R$ 0,15.
 *
 * O efeito prático é o que torna a funcionalidade viável: **uma requisição por
 * espécie faltante** entrega as ~25 opções mais baratas com estoque. Sem a
 * ordenação seria preciso varrer todas as páginas da espécie (Bulbasaur tem 86
 * cartas em 3 páginas) para depois ordenar aqui.
 *
 * ## Preço zero não é carta grátis
 *
 * `R$ 0,00` nos três campos significa **nenhum lojista tem a carta**. Tratar
 * como preço a mostrar colocaria a carta indisponível no topo de uma lista de
 * compras — o erro mais fácil e mais burro possível aqui. `preco` fica `null`
 * nesse caso, e a decisão de exibir ou não é de quem chama.
 */

/** Uma linha da lista de resultados da busca. */
export interface LinhaBuscaLiga {
  /** Nome da carta como o site escreve, sem a numeração: `Bulbasaur`. */
  nome: string;
  /** Sigla da edição no site deles: `MEG`, `SW`, `QSG-G`. */
  edicaoSigla: string;
  /** Id numérico interno da edição no site deles. Chave estável do mapeamento. */
  edicaoId: number | null;
  /** Nome da edição por extenso: `Mega Evolution`. */
  edicaoNome: string;
  /** Número impresso na carta, como o site devolve (`001`, `77`, `0102-07`). */
  numero: string;
  /** Total impresso, o denominador: `165`, `30th-P`, `∞`. */
  total: string | null;
  /** Menor preço com estoque, em BRL. `null` quando ninguém tem a carta. */
  preco: number | null;
  /** Preço médio entre os lojistas. `null` quando não há estoque. */
  precoMedio: number | null;
  /** Maior preço entre os lojistas. `null` quando não há estoque. */
  precoMaximo: number | null;
  /** Caminho da carta no site deles, para o link "ver ofertas". */
  caminho: string;
}

const BASE = "https://www.ligapokemon.com.br/";

/**
 * O termo que vai para a busca deles, a partir do nome da espécie no nosso
 * catálogo.
 *
 * **Nidoran♀ e Nidoran♂ não existem lá com esse nome.** Eles escrevem
 * `Nidoran [F]`, `Nidoran Female`, `Nidoran Fêmea`, `Nidoran Male` — quatro
 * grafias para duas espécies. Buscar pelo símbolo devolve zero resultados, e
 * zero resultado é indistinguível de "não tem carta barata": as duas vagas
 * apareciam vazias na primeira varredura completa (2026-09-02).
 *
 * A saída é buscar o radical e **exigir casamento com o catálogo**. Sem essa
 * exigência, a busca por "Nidoran" traria as cartas do macho para a vaga da
 * fêmea, marcadas como fora do catálogo — oferta errada com cara de oferta.
 */
export function termoDeBusca(especie: string): {
  termo: string;
  /** Descartar linha que não casou com o catálogo, por ambiguidade do termo. */
  exigeCasamento: boolean;
} {
  if (/[♀♂]/.test(especie)) {
    return { termo: especie.replace(/[♀♂]/g, "").trim(), exigeCasamento: true };
  }
  return { termo: especie, exigeCasamento: false };
}

/**
 * URL da busca. `termo` é o nome procurado — a espécie, na Pokédex; o nome da
 * carta, no set. `pagina` começa em 1.
 *
 * O termo vai junto de `searchprod=0` dentro do próprio parâmetro `card` —
 * é assim que a sintaxe de busca deles funciona, com os filtros separados por
 * espaço dentro do termo, e não como parâmetros irmãos na query string.
 *
 * **Só nome.** Medido em 2026-09-03: acrescentar filtro de edição ao termo
 * (`ed=PFL`, `edid=738`, ou os dois, exatamente como o site escreve o próprio
 * link) faz a página trocar para renderização por JavaScript e voltar sem
 * nenhuma linha de carta no HTML. Não adianta tentar de novo — ver
 * `liga-set.ts`.
 */
export function urlBuscaLiga(termo: string, pagina = 1): string {
  const busca = encodeURIComponent(`${termo} searchprod=0`);
  return `${BASE}?view=cards/search&card=${busca}&tipo=1&orderBy=7&page=${pagina}`;
}

/**
 * O nome da carta é plausivelmente desta espécie?
 *
 * A busca deles casa por substring: procurar "Mew" devolve **Mewtwo**, que é
 * outra espécie e outra vaga. Enquanto a carta casa com o nosso catálogo o
 * `dexId` resolve; a linha que NÃO casa não tem `dexId` nenhum, e sem esta
 * checagem ela entrava na vaga errada marcada como "fora do catálogo" —
 * oferta errada com cara de oferta (visto na vaga do Mew, 2026-09-02).
 *
 * A regra é palavra inteira: "Mewtwo" não contém "Mew" como palavra, mas
 * "Team Rocket's Nidoran Female" contém "Nidoran". Acentuação e caixa são
 * normalizadas; pontuação do nome (`Mr. Mime`, `Farfetch'd`) é escapada.
 */
export function nomeCompativelComEspecie(nomeCarta: string, especie: string): boolean {
  const normalizar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const alvo = normalizar(especie).replace(/[♀♂]/g, "").trim();
  if (alvo === "") return false;

  const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `\b` não funciona junto de apóstrofo e ponto do jeito esperado em todos
  // os casos, então a borda é explícita: início/fim ou caractere que não seja
  // letra ou dígito.
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(normalizar(nomeCarta));
}

/**
 * Converte preço em pt-BR (`1.234,56`) para número. Devolve `null` para zero,
 * que no site significa "sem estoque" e não "de graça".
 */
function precoParaNumero(bruto: string | undefined): number | null {
  if (!bruto) return null;
  const valor = Number(bruto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return valor;
}

function primeiroGrupo(html: string, padrao: RegExp): string | undefined {
  return padrao.exec(html)?.[1];
}

/**
 * Desfaz a codificação de URL do rótulo que vem dentro do `href`.
 *
 * O site escreve `Team+Rocket%27s+Drowzee` ali: espaço vira `+` e apóstrofo
 * vira `%27`. Sem isso o nome chega torto na tela e na exportação — e foi
 * assim que ele apareceu na primeira varredura real, em 2026-09-02.
 *
 * O `caminho` **não** passa por aqui: ele é URL, e decodificar quebraria o
 * link para o site deles.
 */
function decodificarUrl(texto: string): string {
  const comEspacos = texto.replace(/\+/g, " ");
  try {
    return decodeURIComponent(comEspacos);
  } catch {
    // Sequência percentual malformada: melhor o texto cru do que uma exceção
    // derrubando a página inteira de resultados.
    return comEspacos;
  }
}

/** Desfaz as entidades HTML que aparecem em nome de carta e de edição. */
function decodificar(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&([a-z])(acute|grave|circ|tilde|uml|cedil);/g, (_, letra: string, acento: string) => {
      const mapa: Record<string, Record<string, string>> = {
        acute: { a: "á", e: "é", i: "í", o: "ó", u: "ú", c: "ć" },
        grave: { a: "à", e: "è", i: "ì", o: "ò", u: "ù" },
        circ: { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
        tilde: { a: "ã", o: "õ", n: "ñ" },
        uml: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü" },
        cedil: { c: "ç" },
      };
      return mapa[acento]?.[letra] ?? letra;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai as linhas de uma página de resultado.
 *
 * Tolerante por decisão: bloco sem link de carta é ignorado em silêncio em vez
 * de derrubar a varredura inteira. O site mistura no mesmo grid linhas que não
 * são carta, e uma delas não pode custar as outras 39.
 */
export function parsearBuscaLiga(html: string): LinhaBuscaLiga[] {
  const blocos = html.split('<div class="mtg-single">').slice(1);
  const linhas: LinhaBuscaLiga[] = [];

  for (const bloco of blocos) {
    // O nome vai até `&ed=`, não até o primeiro `&`: o site escreve entidades
    // HTML dentro do parâmetro (`Mewtwo (104/&infin;)`), e um `[^"&]+` corta
    // ali. Foi isso que fez a página do Mewtwo parecer incompleta e a
    // paginação parar antes do estoque (2026-09-02).
    const link = /href="(\/\?view=cards\/card&card=(.*?)&ed=([^"&]*)&num=([^"&]*))"/.exec(bloco);
    if (!link) continue;

    const rotulo = decodificar(decodificarUrl(link[2]));
    const numeracao = /\(([^/()]*)\/([^/()]*)\)\s*$/.exec(rotulo);

    const edicaoIdBruto = primeiroGrupo(bloco, /card=edid=(\d+)/);
    const edicaoNome = primeiroGrupo(bloco, /class="edition-name"[^>]*>([\s\S]*?)<\/a>/);

    linhas.push({
      nome: decodificar(rotulo.replace(/\s*\([^()]*\)\s*$/, "")),
      edicaoSigla: decodificar(decodificarUrl(link[3])),
      edicaoId: edicaoIdBruto ? Number(edicaoIdBruto) : null,
      edicaoNome: edicaoNome ? decodificar(edicaoNome) : "",
      numero: decodificar(decodificarUrl(link[4])),
      total: numeracao ? decodificar(numeracao[2]) : null,
      // O `\s*<` no fim não é frescura: quando a carta variou de preço no dia,
      // o site enfia um `<img>` indicador entre o valor e o fim da célula, e
      // um regex que exija `<` colado ao número lê a carta como sem estoque.
      preco: precoParaNumero(primeiroGrupo(bloco, /class="price-min">R\$\s*([\d.,]+)\s*</)),
      precoMedio: precoParaNumero(primeiroGrupo(bloco, /class="price-avg">R\$\s*([\d.,]+)\s*</)),
      precoMaximo: precoParaNumero(primeiroGrupo(bloco, /class="price-max">R\$\s*([\d.,]+)\s*</)),
      caminho: decodificar(link[1]),
    });
  }

  return linhas;
}

/**
 * A varredura precisa saber quando parar de paginar. Duas condições, e a
 * segunda é a que importa: a página veio incompleta (menos que o tamanho
 * cheio), **ou** o menor preço desta página já passou do teto escolhido —
 * como a ordenação é crescente, tudo o que vier depois é mais caro ainda.
 */
export const LINHAS_POR_PAGINA = 40;

/** Quantos blocos de carta a página traz — parseáveis ou não. */
export function contarBlocosBusca(html: string): number {
  return html.split('<div class="mtg-single">').length - 1;
}

/**
 * `blocos` é o que a página trouxe; `linhas` é o que conseguimos ler. A
 * decisão de paginar usa **blocos**, não linhas: um único bloco que o parser
 * não entenda faria a página cheia parecer a última, e a varredura pararia
 * antes de chegar ao estoque. Aconteceu com o Mewtwo — 40 blocos, 39 lidos,
 * e as opções de R$ 0,50 ficaram na página 2 que nunca foi buscada.
 */
export function deveBuscarProximaPagina(
  pagina: { blocos: number; linhas: LinhaBuscaLiga[] },
  tetoPreco: number | null,
): boolean {
  if (pagina.blocos < LINHAS_POR_PAGINA) return false;
  if (tetoPreco === null) return true;

  const precos = pagina.linhas.map((l) => l.preco).filter((p): p is number => p !== null);
  // Página inteira sem estoque: as com preço ainda vêm depois, continua.
  if (precos.length === 0) return true;
  return Math.max(...precos) < tetoPreco;
}
