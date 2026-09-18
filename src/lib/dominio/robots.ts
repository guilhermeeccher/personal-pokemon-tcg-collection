/**
 * Leitura de `robots.txt` — módulo puro: não faz requisição, não toca banco.
 * Quem busca o arquivo ao vivo é `lib/liga/ritmo.ts`.
 *
 * ## Por que o arquivo, e não uma constante
 *
 * O ritmo contra a LigaPokemon vinha de um número fixo no código. Um número
 * fixo envelhece nos dois sentidos: se eles afrouxarem o `Crawl-delay`,
 * ninguém se beneficia; se apertarem, ninguém obedece. Lendo o arquivo, quem
 * decide o ritmo é quem é dono do site — que é como deveria ser, e é a única
 * forma de distribuir a ferramenta sem transferir risco para quem instalar.
 *
 * O mesmo arquivo responde a segunda pergunta: **esta rota pode?**. Derivar a
 * checagem do arquivo lido faz uma proibição nova valer no dia em que eles a
 * escrevem, sem release nosso.
 *
 * ## O que este parser implementa
 *
 * O suficiente do padrão de exclusão de robôs (REP) para os dois usos acima:
 *
 * - Agrupamento por `User-agent`, com linhas consecutivas de agente formando
 *   um cabeçalho só (é como o padrão define grupo).
 * - Seleção do grupo: o que casa com o nosso agente vence o `*`. Sem grupo
 *   específico, vale o `*`. Sem `*`, não há regra — e aí nada é proibido pelo
 *   arquivo (a garantia dura vive em `lib/liga/ritmo.ts`, não aqui).
 * - `Allow` e `Disallow` com curinga `*` e ancoragem `$`, decididos por
 *   **casamento mais longo**, com empate resolvido a favor do `Allow`.
 * - `Crawl-delay`, em segundos.
 *
 * O casamento é feito contra **caminho + query string**, não só o caminho: a
 * LigaPokemon roteia tudo por `?view=cards/search`, então uma regra sobre
 * `cards/pricehistory` só é legível com a query junto.
 *
 * Comentário (`#`), campo desconhecido (`Sitemap`, `Host`) e linha malformada
 * são ignorados em silêncio — arquivo de terceiro não é contrato, e o que não
 * dá para entender não pode virar exceção aqui.
 */

export interface RegraRobots {
  tipo: "allow" | "disallow";
  /** Padrão como escrito no arquivo, com `*` e `$` ainda crus. */
  padrao: string;
}

export interface RegrasRobots {
  /** Segundos pedidos entre duas requisições. `null` quando o arquivo não diz. */
  crawlDelaySegundos: number | null;
  regras: RegraRobots[];
}

/** Arquivo ilegível ou sem grupo que nos sirva: nada declarado. */
export const REGRAS_VAZIAS: RegrasRobots = { crawlDelaySegundos: null, regras: [] };

interface Grupo {
  agentes: string[];
  regras: RegraRobots[];
  crawlDelaySegundos: number | null;
}

/**
 * Lê o arquivo e devolve o que vale **para o nosso agente**.
 *
 * `agente` é o User-Agent que enviamos. O casamento do padrão é por token
 * contido no nosso UA, sem caixa — é assim que `Googlebot` casa com
 * `Mozilla/5.0 (compatible; Googlebot/2.1; ...)`.
 */
export function parsearRobots(texto: string, agente: string): RegrasRobots {
  const grupos: Grupo[] = [];
  let grupo: Grupo | null = null;
  // Linhas de `User-agent` consecutivas pertencem ao mesmo cabeçalho; a
  // primeira diretiva fecha o cabeçalho e o próximo agente abre grupo novo.
  let noCabecalho = false;

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.split("#")[0].trim();
    if (linha === "") continue;

    const separador = linha.indexOf(":");
    if (separador === -1) continue;
    const campo = linha.slice(0, separador).trim().toLowerCase();
    const valor = linha.slice(separador + 1).trim();

    if (campo === "user-agent" || campo === "useragent") {
      if (grupo === null || !noCabecalho) {
        grupo = { agentes: [], regras: [], crawlDelaySegundos: null };
        grupos.push(grupo);
        noCabecalho = true;
      }
      grupo.agentes.push(valor.toLowerCase());
      continue;
    }

    // Diretiva antes de qualquer `User-agent` não pertence a ninguém.
    if (grupo === null) continue;
    noCabecalho = false;

    if (campo === "allow" || campo === "disallow") {
      grupo.regras.push({ tipo: campo, padrao: valor });
      continue;
    }
    if (campo === "crawl-delay" || campo === "crawldelay") {
      const numero = Number(valor.replace(",", "."));
      if (Number.isFinite(numero) && numero >= 0) grupo.crawlDelaySegundos = numero;
    }
  }

  const alvo = agente.toLowerCase();
  const especificos = grupos.filter((g) =>
    g.agentes.some((a) => a !== "*" && a !== "" && alvo.includes(a)),
  );
  const escolhidos =
    especificos.length > 0 ? especificos : grupos.filter((g) => g.agentes.includes("*"));

  if (escolhidos.length === 0) return REGRAS_VAZIAS;

  // Dois grupos para o mesmo agente somam as regras. Quando os dois declaram
  // `Crawl-delay`, vale o **maior**: na dúvida sobre qual deles é para nós, o
  // erro barato é esperar demais.
  const atrasos = escolhidos
    .map((g) => g.crawlDelaySegundos)
    .filter((d): d is number => d !== null);

  return {
    crawlDelaySegundos: atrasos.length === 0 ? null : Math.max(...atrasos),
    regras: escolhidos.flatMap((g) => g.regras),
  };
}

function escaparRegex(trecho: string): string {
  return trecho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function casaPadrao(padrao: string, caminho: string): boolean {
  const ancorado = padrao.endsWith("$");
  const corpo = ancorado ? padrao.slice(0, -1) : padrao;
  const expressao = new RegExp(
    `^${corpo.split("*").map(escaparRegex).join(".*")}${ancorado ? "$" : ""}`,
  );
  return expressao.test(caminho);
}

/**
 * Este caminho (com query) pode ser requisitado?
 *
 * Sem regra que case, a resposta é sim — é o default do padrão, e é por isso
 * que a garantia de não tocar nas rotas proibidas **não** pode depender só
 * daqui: arquivo fora do ar viraria permissão para tudo. Ver `lib/liga/ritmo.ts`.
 */
export function caminhoPermitido(regras: RegrasRobots, caminho: string): boolean {
  let melhor: { tipo: "allow" | "disallow"; tamanho: number } | null = null;

  for (const regra of regras.regras) {
    // `Disallow:` sem valor é o jeito de dizer "pode tudo" — não é regra.
    if (regra.padrao === "") continue;
    if (!casaPadrao(regra.padrao, caminho)) continue;

    const tamanho = regra.padrao.replace(/\$$/, "").length;
    const vence =
      melhor === null ||
      tamanho > melhor.tamanho ||
      (tamanho === melhor.tamanho && regra.tipo === "allow");
    if (vence) melhor = { tipo: regra.tipo, tamanho };
  }

  return melhor === null || melhor.tipo === "allow";
}

/**
 * A parte da URL contra a qual o `robots.txt` é avaliado: caminho + query.
 *
 * URL que não parseia devolve a string original — quem chama continua podendo
 * aplicar as regras, e o pior caso é um casamento mais frouxo do que o real.
 */
export function caminhoDeUrl(url: string): string {
  try {
    const parseada = new URL(url);
    return `${parseada.pathname}${parseada.search}`;
  } catch {
    return url;
  }
}
